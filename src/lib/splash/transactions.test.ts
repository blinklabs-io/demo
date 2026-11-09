// @vitest-environment node
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { phaseTwoParams } from "../kernel/phaseTwo.fixture";
import type { Cip30WalletApi } from "../dingo/cip30";
import { pd } from "../kernel/actions";
import { decodeSplashOrder, splashBeacon, splashAddressData, splashFields, type SplashTerms } from "./data";
import { readSplashOrder } from "./read";
import { prepareSplashAction, submitSplashAction } from "./transactions";
import { splashFixture, splashRpcOutput } from "./fixtures";
import references from "./mainnet-refs.fixture.json";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "http://localhost:3000", utxorpcUrl: "http://localhost:9090" } }));
vi.mock("../dingo/blaze", () => ({ getBlaze: vi.fn() }));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("./read", async (original) => ({ ...(await original<typeof import("./read")>()), assertSplashMainnet: vi.fn(), readSplashOrder: vi.fn() }));
beforeAll(() => Core.initCrypto());
const point = (input: Core.TransactionInput) => `${input.transactionId()}#${input.index()}`;
const token = "33".repeat(28) + "01";
const terms: SplashTerms = { input: "lovelace", output: token, amount: 10000000n, minimum: 100000n, stepCost: 1000000n, executorFee: 2000000n, steps: 4, extraAda: 2000000n };
class Ledger extends Provider {
  outputs = new Map<string, Core.TransactionUnspentOutput>();
  evaluations = 0;
  readonly params: Core.ProtocolParameters;
  constructor(params: Core.ProtocolParameters) {
    super(1, "cardano-mainnet");
    this.params = params;
  }
  async getParameters() {
    return this.params;
  }
  async getUnspentOutputs(address: Core.Address) {
    return [...this.outputs.values()].filter(
      (utxo) => utxo.output().address().toBytes() === address.toBytes(),
    );
  }
  async getUnspentOutputsWithAsset(address: Core.Address, asset: Core.AssetId) {
    return (await this.getUnspentOutputs(address)).filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(asset) ?? 0n) > 0n,
    );
  }
  async getUnspentOutputByNFT(asset: Core.AssetId) {
    const outputs = [...this.outputs.values()].filter(
      (utxo) => utxo.output().amount().multiasset()?.get(asset) === 1n,
    );
    if (outputs.length !== 1) throw new Error("Fixture NFT not unique");
    return outputs[0];
  }
  async resolveUnspentOutputs(inputs: Core.TransactionInput[]) {
    return inputs.flatMap((input) => this.outputs.get(point(input)) ?? []);
  }
  async resolveDatum(): Promise<Core.PlutusData> {
    throw new Error("Fixture only uses inline datums");
  }
  async resolveScriptRef(script: Core.Script | Core.Hash28ByteBase16) {
    const hash = typeof script === "string" ? script : script.hash();
    return [...this.outputs.values()].find(
      (utxo) => utxo.output().scriptRef()?.hash() === hash,
    );
  }
  async awaitTransactionConfirmation(): Promise<boolean> {
    throw new Error("No live confirmation");
  }
  async postTransactionToChain(): Promise<Core.TransactionId> {
    throw new Error("No live submission");
  }
  async evaluateTransaction(
    tx: Core.Transaction,
    additional: Core.TransactionUnspentOutput[],
  ) {
    this.evaluations++;
    return makeUplcEvaluator(
      this.params,
      1,
      1,
      Core.SLOT_CONFIG_NETWORK.Mainnet,
    )(tx, [
      ...new Map(
        [...this.outputs.values(), ...additional].map((utxo) => [
          point(utxo.input()),
          utxo,
        ]),
      ).values(),
    ]);
  }
}
async function setup() {
  vi.clearAllMocks();
  const clock = { slot: 200000000 };
  vi.mocked(blockfrostFetch).mockImplementation(async <T>(path: string) => {
    if (path === "/api/v0/epochs/latest/parameters") return phaseTwoParams as T;
    if (path === "/api/v0/blocks/latest") return { slot: clock.slot } as T;
    throw new Error(path);
  });
  const ledger = new Ledger(await new DingoProvider().getParameters());
  for (const item of references.items) { const utxo = splashRpcOutput(item); ledger.outputs.set(point(utxo.input()), utxo); }
  const key = Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32)));
  const address = Core.addressFromCredentials(1, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: key.toPublic().hash().hex() }), Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28)) }));
  for (let index = 0; index < 3; index++) {
    const value = new Core.Value(index === 0 ? 1000000000n : 50000000n, index === 0 ? new Map([[Core.AssetId(token), 1000000000n]]) : undefined);
    const utxo = new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("aa".repeat(32)), BigInt(index)), new Core.TransactionOutput(address, value));
    ledger.outputs.set(point(utxo.input()), utxo);
  }
  const api = { getNetworkId: vi.fn(async () => 1), getChangeAddress: async () => address.toBytes(), getUsedAddresses: async () => [address.toBytes()], getUnusedAddresses: async () => [] } as unknown as Cip30WalletApi;
  const blaze = await Blaze.from(ledger, new ColdWallet(address, 1, ledger));
  vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<ReturnType<typeof getBlaze>>);
  vi.mocked(readSplashOrder).mockImplementation(async (outpoint) => { const output = ledger.outputs.get(outpoint); if (!output) throw new Error("Order unavailable"); return decodeSplashOrder(output); });
  return { ledger, blaze, key, address, api, clock };
}
it.each([true, false])("creates an order and executes its deployed cancellation validator with ADA input=%s", async (adaInput) => {
  const f = await setup();
  const draft = await prepareSplashAction(f.api, { kind: "create", terms: { ...terms, input: adaInput ? "lovelace" : token, output: adaInput ? token : "lovelace" } }, () => {});
  const order = new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(), 0n), draft.output);
  f.ledger.outputs.set(point(order.input()), order);
  const cancelled = await prepareSplashAction(f.api, { kind: "cancel", outpoint: point(order.input()) }, () => {});
  expect(f.ledger.evaluations).toBeGreaterThan(0);
  expect(cancelled.output.amount().toCbor()).toBe(order.output().amount().toCbor());
  expect(cancelled.output.address().toBytes()).toBe(f.address.toBytes());
});
it("decodes current deployed mainnet orders", () => {
  for (let index = 0; index < 2; index++) expect(decodeSplashOrder(splashFixture(index)).cancelKey).toHaveLength(56);
});
it("matches the canonical SDK beacon vector byte for byte", () => {
  const owner = Core.addressFromCredentials(1, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("74104cd5ca6288c1dd2e22ee5c874fdcfc1b81897462d91153496430") }), Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("de7866fe5068ebf3c87dcdb568da528da5dcb5f659d9b60010e7450f") }));
  const datum = pd.con(0, [pd.bytes("00"), pd.bytes("00".repeat(28)), pd.con(0, [pd.bytes(""), pd.bytes("")]), pd.int(1000000n), pd.int(900000n), pd.int(138502n), pd.con(0, [pd.bytes("cebbd6a8ca954b7fc7a346d0baed4182e0358059f38065de279fb822"), pd.bytes("43617264616e6f20436174")]), pd.con(0, [pd.int(13850243829651554n), pd.int(100000000000000000n)]), pd.int(0n), splashAddressData(owner), pd.bytes("74104cd5ca6288c1dd2e22ee5c874fdcfc1b81897462d91153496430"), pd.list([pd.bytes("5cb2c968e5d1c7197a6ce7615967310a375545d9bc65063a964335b2")])]);
  expect(splashBeacon(new Core.TransactionInput(Core.TransactionId("02b493cbd8eb40c3d5ed58372949c6d7c48afcf77416cf25189b118f53af19a4"), 1n), 0n, datum)).toBe("384dc40d3a4361798c5b9eba65245ce972c6b6807034ab51b098d573");
});
it("rejects unsigned funding and a signature over another transaction", async () => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  vi.spyOn(f.blaze, "signTransaction").mockImplementation(async (tx) => tx);
  await expect(submitSplashAction(f.api, draft, () => {})).rejects.toThrow("sign every Splash funding key");
  vi.spyOn(f.blaze, "signTransaction").mockImplementation(async (tx) => { const witnesses = Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor()); witnesses.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(), f.key.sign(Core.HexBlob("22".repeat(32))).hex()]], Core.VkeyWitness.fromCore)); tx.setWitnessSet(witnesses); return tx; });
  await expect(submitSplashAction(f.api, draft, () => {})).rejects.toThrow("sign every Splash funding key");
});
it("rejects a consumed reference and expiry during wallet approval", async () => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  vi.spyOn(f.blaze, "signTransaction").mockImplementation(async (tx) => { f.clock.slot = draft.validUntil; return tx; });
  await expect(submitSplashAction(f.api, draft, () => {})).rejects.toThrow("draft expired");
  f.clock.slot = draft.validUntil - 1;
  f.ledger.outputs.delete(point(splashRpcOutput(references.items[0]).input()));
  await expect(submitSplashAction(f.api, draft, () => {})).rejects.toThrow("changed or were spent");
});
it("rejects a cancellation key not owned by the wallet", async () => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  const fields = splashFields(draft.output.datum()!.asInlineData()!, 0n, 12); fields[10] = pd.bytes("44".repeat(28));
  const output = new Core.TransactionOutput(draft.output.address(), draft.output.amount()); output.setDatum(Core.Datum.newInlineData(pd.con(0, fields)));
  const utxo = new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(), 0n), output); f.ledger.outputs.set(point(utxo.input()), utxo);
  await expect(prepareSplashAction(f.api, { kind: "cancel", outpoint: point(utxo.input()) }, () => {})).rejects.toThrow("does not own");
});
it("verifies a real funding signature and sends the reviewed transaction to the provider", async () => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  vi.spyOn(f.blaze, "signTransaction").mockImplementation(async (tx) => { const witnesses = Core.TransactionWitnessSet.fromCbor(tx.witnessSet().toCbor()); witnesses.setVkeys(Core.CborSet.fromCore([[f.key.toPublic().hex(), f.key.sign(Core.HexBlob(tx.getId())).hex()]], Core.VkeyWitness.fromCore)); tx.setWitnessSet(witnesses); return tx; });
  const post = vi.spyOn(f.ledger, "postTransactionToChain").mockResolvedValue(draft.tx.getId());
  await expect(submitSplashAction(f.api, draft, () => {})).resolves.toBe(String(draft.tx.getId()));
  expect(post).toHaveBeenCalledTimes(1);
});

it.each(["body", "auxiliary", "validity", "account", "reference"])("rejects %s changes during wallet approval", async (change) => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  const post = vi.spyOn(f.ledger, "postTransactionToChain");
  vi.spyOn(f.blaze, "signTransaction").mockImplementation(async (tx) => {
    if (change === "body") return new Core.Transaction(Core.TransactionBody.fromCore({ ...tx.body().toCore(), fee: tx.body().fee() + 1n }), tx.witnessSet(), tx.auxiliaryData());
    if (change === "auxiliary") tx.setAuxiliaryData(Core.AuxiliaryData.fromCbor(Core.HexBlob("a1016161")));
    if (change === "validity") return Core.Transaction.fromCbor(Core.TxCBOR(`84${tx.body().toCbor()}${tx.witnessSet().toCbor()}f4${tx.auxiliaryData()?.toCbor() ?? "f6"}`));
    if (change === "account") vi.spyOn(f.api, "getChangeAddress").mockResolvedValue(Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("44".repeat(28)) })).toBytes());
    if (change === "reference") f.ledger.outputs.delete(point(splashRpcOutput(references.items[0]).input()));
    return tx;
  });
  await expect(submitSplashAction(f.api, draft, () => {})).rejects.toThrow(change === "account" ? "Wallet account changed" : change === "reference" ? "changed or were spent" : "changed the reviewed Splash transaction");
  expect(post).not.toHaveBeenCalled();
});
it("rejects wallet network drift before constructing an order", async () => {
  const f = await setup(); vi.mocked(f.api.getNetworkId).mockResolvedValue(0);
  await expect(prepareSplashAction(f.api, { kind: "create", terms }, () => {})).rejects.toThrow("Wallet network changed");
  expect(getBlaze).not.toHaveBeenCalled();
});

it("cancels a zero-remaining order and returns its accrued output tokens", async () => {
  const f = await setup(), draft = await prepareSplashAction(f.api, { kind: "create", terms }, () => {});
  const fields = splashFields(draft.output.datum()!.asInlineData()!, 0n, 12); fields[3] = pd.int(0n);
  const output = new Core.TransactionOutput(draft.output.address(), new Core.Value(5000000n, new Map([[Core.AssetId(token), 123456n]])));
  output.setDatum(Core.Datum.newInlineData(pd.con(0, fields)));
  const order = new Core.TransactionUnspentOutput(new Core.TransactionInput(draft.tx.getId(), 0n), output); f.ledger.outputs.set(point(order.input()), order);
  const cancelled = await prepareSplashAction(f.api, { kind: "cancel", outpoint: point(order.input()) }, () => {});
  expect(cancelled.output.amount().toCbor()).toBe(output.amount().toCbor()); expect(f.ledger.evaluations).toBeGreaterThan(0);
});
