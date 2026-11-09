// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { DingoProvider } from "../dingo/utxorpc/provider";
import type { Cip30WalletApi } from "../dingo/cip30";
import { prepareBridgeTransaction, submitBridgeTransaction } from "./transactions";
import { readBridgeSettings } from "./api";
import { blockfrostFetch } from "../dingo/blockfrost";
import { PRIME_BRIDGE_ADDRESS } from "./plan";
const state = vi.hoisted(() => ({ provider: null as unknown as DingoProvider }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "prime-testnet", label: "Prime Testnet", networkMagic: 3311 }, DINGO_CONFIG: {} }));
vi.mock("../dingo/utxorpc/provider", async (original) => ({ ...await original<typeof import("../dingo/utxorpc/provider")>(), getDingoProvider: () => state.provider }));
vi.mock("../dingo/blockfrost", async (original) => ({ ...await original<typeof import("../dingo/blockfrost")>(), blockfrostFetch: vi.fn() }));
vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), readBridgeSettings: vi.fn() }));
beforeAll(() => Core.initCrypto());
beforeEach(() => vi.clearAllMocks());
function fixture() {
  const key = Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("11".repeat(32)));
  const address = Core.addressFromCredential(0, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: key.toPublic().hash().hex() }));
  const asset = Core.AssetId("33".repeat(28) + "544f4b");
  const value = new Core.Value(100000000n);
  value.setMultiasset(new Map([[asset, 42n]]));
  const input = new Core.TransactionInput(Core.TransactionId("44".repeat(32)), 0n);
  const funding = new Core.TransactionUnspentOutput(input, new Core.TransactionOutput(address, value));
  const settings = { minimum: 1000000n, maximum: 1000000000000n, fee: 1000010n, destinations: ["vector", "nexus"] as ("vector" | "nexus")[], paused: false };
  let slot = 100, magic = 3311, unspent = true, connected = true, changed = false;
  let signing: (() => void) | undefined;
  const api = {
    getNetworkId: async () => 0,
    getChangeAddress: async () => changed ? Core.addressFromCredential(0, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("99".repeat(28)) })).toBytes() : address.toBytes(),
    getUtxos: async () => [funding.toCbor()],
    getCollateral: async () => [],
    signTx: vi.fn(async (cbor: string) => {
      const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
      const witness = new Core.TransactionWitnessSet();
      witness.setVkeys(Core.CborSet.fromCore([[key.toPublic().hex(), key.sign(Core.HexBlob(tx.getId())).hex()]], Core.VkeyWitness.fromCore));
      signing?.();
      return witness.toCbor();
    }),
  } as unknown as Cip30WalletApi;
  const post = vi.fn(async (tx: Core.Transaction, guard?: () => void) => { guard?.(); return tx.getId(); });
  state.provider = {
    network: Core.NetworkId.Testnet,
    getParameters: async () => Core.hardCodedProtocolParams,
    queryClient: { readGenesis: async () => ({ networkMagic: magic }) },
    resolveUnspentOutputs: async (inputs: Core.TransactionInput[]) => unspent ? inputs.filter((row) => row.transactionId() === input.transactionId() && row.index() === input.index()).map(() => funding) : [],
    postTransactionToChain: post,
  } as unknown as DingoProvider;
  vi.mocked(blockfrostFetch).mockImplementation(async (path) => (path === "/api/v0/genesis" ? { network_magic: magic } : { slot }) as never);
  vi.mocked(readBridgeSettings).mockImplementation(async () => ({ ...settings }));
  const guard = () => { if (!connected) throw new Error("Session changed"); };
  const action = { destination: "nexus" as const, address: "0x" + "22".repeat(20), amount: "10" };
  return { api, action, guard, post, address, asset, settings, funding, setSlot: (value: number) => { slot = value; }, setMagic: (value: number) => { magic = value; }, spend: () => { unspent = false; }, disconnect: () => { connected = false; }, changeWallet: () => { changed = true; }, onSign: (fn: () => void) => { signing = fn; } };
}
it("balances a native bridge transaction, preserves tokens in wallet change, signs and submits through Dingo", async () => {
  const f = fixture();
  const draft = await prepareBridgeTransaction(f.api, f.action, f.guard);
  expect(draft.tx.body().outputs()[0].address().toBech32()).toBe(PRIME_BRIDGE_ADDRESS);
  expect(draft.tx.body().outputs()[0].amount().coin()).toBe(11000010n);
  const change = draft.tx.body().outputs().slice(1);
  expect(change.every((output) => output.address().toBech32() === f.address.toBech32())).toBe(true);
  expect(change.reduce((n, output) => n + (output.amount().multiasset()?.get(f.asset) ?? 0n), 0n)).toBe(42n);
  expect(draft.tx.body().outputs().reduce((n, output) => n + output.amount().coin(), draft.tx.body().fee())).toBe(100000000n);
  expect(await submitBridgeTransaction(draft, f.api, f.guard)).toBe(draft.hash);
  expect(f.api.signTx).toHaveBeenCalledTimes(1);
  expect(f.post).toHaveBeenCalledTimes(1);
});
it.each([
  ["network", "requires Prime Testnet"], ["fee", "bridge fee changed"], ["pause", "route is not available"],
  ["expired", "expired or wallet changed"], ["spent", "funding is not available"], ["wallet", "expired or wallet changed"], ["session", "Session changed"],
])("rejects %s changes while signing without submitting", async (change, reason) => {
  const f = fixture();
  const draft = await prepareBridgeTransaction(f.api, f.action, f.guard);
  f.onSign(() => {
    if (change === "network") f.setMagic(2);
    if (change === "fee") f.settings.fee++;
    if (change === "pause") f.settings.paused = true;
    if (change === "expired") f.setSlot(draft.validUntil);
    if (change === "spent") f.spend();
    if (change === "wallet") f.changeWallet();
    if (change === "session") f.disconnect();
  });
  await expect(submitBridgeTransaction(draft, f.api, f.guard)).rejects.toThrow(reason);
  expect(f.post).not.toHaveBeenCalled();
});
it("refuses a mutated draft before asking the wallet to sign", async () => {
  const f = fixture();
  const draft = await prepareBridgeTransaction(f.api, f.action, f.guard);
  const body = draft.tx.body(); body.setFee(body.fee() + 1n); draft.tx.setBody(body);
  await expect(submitBridgeTransaction(draft, f.api, f.guard)).rejects.toThrow("draft changed");
  expect(f.api.signTx).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("rejects the wrong Prime network before constructing a transaction", async () => {
  const f = fixture(); f.setMagic(2);
  await expect(prepareBridgeTransaction(f.api, f.action, f.guard)).rejects.toThrow("Prime Testnet");
  expect(f.api.signTx).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});

it("rejects witnesses from an unrelated signing key", async () => {
  const f = fixture();
  const draft = await prepareBridgeTransaction(f.api, f.action, f.guard);
  vi.mocked(f.api.signTx).mockImplementation(async (cbor) => {
    const key = Core.Ed25519PrivateKey.fromNormalHex(Core.Ed25519PrivateNormalKeyHex("55".repeat(32)));
    const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
    const witness = new Core.TransactionWitnessSet();
    witness.setVkeys(Core.CborSet.fromCore([[key.toPublic().hex(), key.sign(Core.HexBlob(tx.getId())).hex()]], Core.VkeyWitness.fromCore));
    return witness.toCbor();
  });
  await expect(submitBridgeTransaction(draft, f.api, f.guard)).rejects.toThrow("every bridge funding input");
  expect(f.post).not.toHaveBeenCalled();
});

it("builds the Vector route with its canonical destination in metadata", async () => {
  const f = fixture();
  const address = Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("22".repeat(28)) })).toBech32();
  const draft = await prepareBridgeTransaction(f.api, { ...f.action, destination: "vector", address }, f.guard);
  expect(draft.action.destination).toBe("vector");
  const payload = draft.tx.auxiliaryData()!.metadata()!.toCore().get(1n) as Map<string, Core.Cardano.Metadatum>;
  expect(payload.get("d")).toBe("vector");
  expect(await submitBridgeTransaction(draft, f.api, f.guard)).toBe(draft.hash);
});
it.each(["unavailable", "paused", "limit"])("refuses %s conditions before review", async (condition) => {
  const f = fixture();
  const reason = condition === "unavailable" ? "Reactor unavailable" : condition === "paused" ? "route is not available" : "current transfer limits";
  if (condition === "unavailable") vi.mocked(readBridgeSettings).mockRejectedValue(new Error(reason));
  if (condition === "paused") f.settings.paused = true;
  if (condition === "limit") f.settings.maximum = 1n;
  await expect(prepareBridgeTransaction(f.api, f.action, f.guard)).rejects.toThrow(reason);
  expect(f.api.signTx).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it.each(["datum", "native script", "Plutus script"])("refuses a funding output with a %s attached", async (kind) => {
  const f = fixture();
  const output = f.funding.output();
  if (kind === "datum") output.setDatum(Core.Datum.newInlineData(Core.PlutusData.newInteger(1n)));
  else if (kind === "native script") output.setScriptRef(Core.Script.newNativeScript(Core.NativeScript.fromCore({ __type: Core.Cardano.ScriptType.Native, kind: Core.Cardano.NativeScriptKind.RequireSignature, keyHash: Core.Ed25519KeyHashHex("11".repeat(28)) })));
  else output.setScriptRef(Core.Script.newPlutusV2Script(new Core.PlutusV2Script(Core.HexBlob("49480100002221200101"))));
  await expect(prepareBridgeTransaction(f.api, f.action, f.guard)).rejects.toThrow("plain outputs");
  expect(f.api.signTx).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});

it("selects plain funding while leaving a native-script reference output untouched", async () => {
  const f = fixture();
  const output = new Core.TransactionOutput(f.address, new Core.Value(10000000000n));
  output.setScriptRef(Core.Script.newNativeScript(Core.NativeScript.fromCore({ __type: Core.Cardano.ScriptType.Native, kind: Core.Cardano.NativeScriptKind.RequireSignature, keyHash: Core.Ed25519KeyHashHex("11".repeat(28)) })));
  const reference = new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("66".repeat(32)), 0n), output);
  vi.spyOn(f.api, "getUtxos").mockResolvedValue([reference.toCbor(), f.funding.toCbor()]);
  const draft = await prepareBridgeTransaction(f.api, f.action, f.guard);
  expect(draft.tx.body().inputs().toCore()).toEqual([f.funding.input().toCore()]);
  expect(await submitBridgeTransaction(draft, f.api, f.guard)).toBe(draft.hash);
});
