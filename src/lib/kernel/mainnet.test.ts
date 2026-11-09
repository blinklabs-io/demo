// @vitest-environment node
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import {
  prepareKernelTransaction,
  type KernelAction,
  type KernelDraft,
} from "./transactions";
import referenceFixture from "./mainnet-refs.fixture.json";
import orderFixture from "./mainnet-orders.fixture.json";
import { loadKernelPage } from "./markets";
import { assertKernelLane } from "./protocol";
import { ADA } from "./actions";
import { kernelRecord } from "./markets";
import {
  phaseTwoParams,


} from "./phaseTwo.fixture";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 },
  DINGO_CONFIG: {
    blockfrostUrl: "http://127.0.0.1:3000",
    utxorpcUrl: "http://127.0.0.1:9090",
  },
}));
vi.mock("../dingo/walletSession", async (original) => ({
  ...(await original<typeof import("../dingo/walletSession")>()),
  assertDingoTransactionBackends: vi.fn(),
}));
vi.mock("../dingo/blaze", async (original) => ({
  ...(await original<typeof import("../dingo/blaze")>()),
  getBlaze: vi.fn(),
}));
vi.mock("../dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
beforeAll(() => Core.initCrypto());
const collateralAsset = { policyId: "33".repeat(28), name: "01" };
const nft = { policyId: "44".repeat(28), name: "53504f54" };
const baseSlot = 138000000;
const slotTime = (slot: number) =>
  Core.SLOT_CONFIG_NETWORK.Mainnet.zeroTime +
  (slot - Core.SLOT_CONFIG_NETWORK.Mainnet.zeroSlot) *
    Core.SLOT_CONFIG_NETWORK.Mainnet.slotLength;
const point = (input: Core.TransactionInput) =>
  `${input.transactionId()}#${input.index()}`;
class MemoryProvider extends Provider {
  ledger = new Map<string, Core.TransactionUnspentOutput>();
  evaluations = 0;
  postAttempts = 0;
  slot = baseSlot;
  readonly params: Core.ProtocolParameters;
  constructor(params: Core.ProtocolParameters) {
    super(Core.NetworkId.Mainnet, "cardano-mainnet");
    this.params = params;
  }
  async getParameters() {
    return this.params;
  }
  async getUnspentOutputs(address: Core.Address) {
    return [...this.ledger.values()].filter(
      (utxo) => utxo.output().address().toBytes() === address.toBytes(),
    );
  }
  async getUnspentOutputsWithAsset(address: Core.Address, unit: Core.AssetId) {
    return (await this.getUnspentOutputs(address)).filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(unit) ?? 0n) > 0n,
    );
  }
  async getUnspentOutputByNFT(unit: Core.AssetId) {
    const values = [...this.ledger.values()].filter(
      (utxo) => (utxo.output().amount().multiasset()?.get(unit) ?? 0n) > 0n,
    );
    if (values.length !== 1) throw new Error("NFT output is not unique");
    return values[0];
  }
  async resolveUnspentOutputs(inputs: Core.TransactionInput[]) {
    return inputs.map((input) => {
      const value = this.ledger.get(point(input));
      if (!value) throw new Error("Virtual output not found: " + point(input));
      return value;
    });
  }
  async resolveDatum(): Promise<Core.PlutusData> {
    throw new Error("No hashed datum in this fixture");
  }
  async resolveScriptRef(script: Core.Script | Core.Hash28ByteBase16) {
    const hash = typeof script === "string" ? script : script.hash();
    return [...this.ledger.values()].find(
      (utxo) => utxo.output().scriptRef()?.hash() === hash,
    );
  }
  async awaitTransactionConfirmation(): Promise<boolean> {
    throw new Error("No confirmation API in this fixture");
  }
  async postTransactionToChain(): Promise<Core.TransactionId> {
    this.postAttempts++;
    throw new Error("Submission is prohibited in phase-two fixtures");
  }
  async evaluateTransaction(
    tx: Core.Transaction,
    additional: Core.TransactionUnspentOutput[],
  ) {
    this.evaluations++;
    const values = new Map(
      [...this.ledger.values(), ...additional].map((utxo) => [
        point(utxo.input()),
        utxo,
      ]),
    );
    return makeUplcEvaluator(
      this.params,
      1,
      1,
      Core.SLOT_CONFIG_NETWORK.Mainnet,
    )(tx, [...values.values()]);
  }

  apply(draft: KernelDraft) {
    for (const input of draft.tx.body().inputs().values())
      this.ledger.delete(point(input));
    draft.tx
      .body()
      .outputs()
      .forEach((output, index) => {
        const utxo = new Core.TransactionUnspentOutput(
          new Core.TransactionInput(draft.tx.getId(), BigInt(index)),
          output,
        );
        this.ledger.set(point(utxo.input()), utxo);
      });
  }
}
async function fixture() {
  vi.mocked(assertDingoTransactionBackends).mockResolvedValue();
  const state: { provider?: MemoryProvider } = {};
  vi.mocked(blockfrostFetch).mockImplementation(async <T>(path: string) => {
    if (path === "/api/v0/epochs/latest/parameters") return phaseTwoParams as T;
    if (path === "/api/v0/blocks/latest")
      return {
        slot: state.provider?.slot ?? baseSlot,
        time: slotTime(state.provider?.slot ?? baseSlot) / 1000,
      } as T;
    throw new Error("Unexpected fixture read: " + path);
  });
  const params = await new DingoProvider().getParameters();
  const ledger = new MemoryProvider(params);
  state.provider = ledger;
  for (const ref of referenceFixture.items) {
    const output = Core.TransactionOutput.fromCbor(Core.HexBlob(Buffer.from(ref.nativeBytes, "base64").toString("hex")));
    const utxo = new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Buffer.from(ref.txoRef.hash, "base64").toString("hex")), BigInt(ref.txoRef.index ?? 0)), output);
    ledger.ledger.set(point(utxo.input()), utxo);
  }
  const wallets = new Map<
    Cip30WalletApi,
    Awaited<ReturnType<typeof getBlaze>>
  >();
  const wallet = async (prefix: string) => {
    const stake = prefix.repeat(28),
      address = Core.addressFromCredentials(
        1,
        Core.Credential.fromCore({
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16(stake),
        }),
        Core.Credential.fromCore({
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16(stake),
        }),
      );
    const reward = Core.RewardAddress.fromCredentials(1, {
      type: Core.CredentialType.KeyHash,
      hash: Core.Hash28ByteBase16(stake),
    }).toAddress();
    for (let index = 0; index < 4; index++) {
      const tokens =
        index === 0
          ? new Map([
              [
                Core.AssetId(collateralAsset.policyId + collateralAsset.name),
                1000000n,
              ],
              ...(prefix === "22"
                ? [
                    [Core.AssetId(nft.policyId + nft.name), 1n] as [
                      Core.AssetId,
                      bigint,
                    ],
                  ]
                : []),
            ])
          : undefined;
      const utxo = new Core.TransactionUnspentOutput(
        new Core.TransactionInput(
          Core.TransactionId(prefix.repeat(32)),
          BigInt(index),
        ),
        new Core.TransactionOutput(
          address,
          new Core.Value(index === 0 ? 10000000000n : 50000000n, tokens),
        ),
      );
      ledger.ledger.set(point(utxo.input()), utxo);
    }
    const api = {
      getNetworkId: async () => 1,
      getRewardAddresses: async () => [reward.toBytes()],
    } as unknown as Cip30WalletApi;
    const blaze = await Blaze.from(
      ledger,
      new ColdWallet(address, Core.NetworkId.Mainnet, ledger),
    );
    wallets.set(api, { blaze } as unknown as Awaited<
      ReturnType<typeof getBlaze>
    >);
    return { api, stake, address };
  };
  const borrower = await wallet("11"),
    writer = await wallet("22");
  vi.mocked(getBlaze).mockImplementation(async (api) => {
    const handle = wallets.get(api);
    if (!handle) throw new Error("Unknown fixture wallet");
    return handle;
  });
  const build = async (api: Cip30WalletApi, action: KernelAction) => {
    const before = ledger.evaluations;
    const draft = await prepareKernelTransaction(api, action, () => {});
    expect(ledger.evaluations).toBeGreaterThan(before);
    expect(
      draft.tx
        .witnessSet()
        .redeemers()!
        .values()
        .every(
          (redeemer) =>
            redeemer.exUnits().mem() > 0n && redeemer.exUnits().steps() > 0n,
        ),
    ).toBe(true);
    expect(ledger.postAttempts).toBe(0);
    return draft;
  };
  const asRecord = (
    draft: KernelDraft,
    index: number,
    lane: Parameters<typeof kernelRecord>[0],
  ) =>
    kernelRecord(
      lane,
      new Core.TransactionUnspentOutput(
        new Core.TransactionInput(draft.tx.getId(), BigInt(index)),
        draft.tx.body().outputs()[index],
      ),
    );
  return { ledger, borrower, writer, build, asRecord };
}

it("executes mainnet CardanoSwaps creation, partial fill, and owner cancellation with deployed scripts", async () => {
  const f = await fixture();
  const created = await f.build(f.writer.api, { kind: "limit-order", offer: collateralAsset, offerQuantity: 100n, ask: ADA, price: { numerator: 1000000n, denominator: 3n }, deposit: 5000000n });
  expect(created.output.address().getNetworkId()).toBe(1);
  f.ledger.apply(created);
  const order = f.asRecord(created, 0, "one-way");
  const fill = await f.build(f.borrower.api, { kind: "swap", record: order, take: 7n });
  expect(fill.output.amount().coin() - created.output.amount().coin()).toBe(2333334n);
  f.ledger.apply(fill);
  await f.build(f.writer.api, { kind: "close-position", record: f.asRecord(fill, 0, "one-way") });
}, 30000);
it("decodes authenticated live mainnet orders and rejects testnet copies", () => {
  for (const item of orderFixture.items) {
    const output = Core.TransactionOutput.fromCbor(Core.HexBlob(Buffer.from(item.nativeBytes, "base64").toString("hex")));
    const input = new Core.TransactionInput(Core.TransactionId(Buffer.from(item.txoRef.hash, "base64").toString("hex")), BigInt(item.txoRef.index ?? 0));
    expect(kernelRecord("one-way", new Core.TransactionUnspentOutput(input, output)).kind).toBe("SwapDatum");
    const testnet = new Core.TransactionOutput(Core.Address.fromBytes(Core.HexBlob("00" + output.address().toBytes().slice(2))), output.amount());
    testnet.setDatum(output.datum()!);
    expect(() => kernelRecord("one-way", new Core.TransactionUnspentOutput(input, testnet))).toThrow("canonical Kernel validator");
  }
});
it("rejects unsupported mainnet lanes before a provider lookup", async () => {
  const resolve = vi.fn();
  expect(() => assertKernelLane("two-way")).toThrow("one-way orders");
  await expect(loadKernelPage("loan-active", "", undefined, { resolveUnspentOutputs: resolve } as unknown as DingoProvider)).rejects.toThrow("one-way orders");
  expect(resolve).not.toHaveBeenCalled();
});
