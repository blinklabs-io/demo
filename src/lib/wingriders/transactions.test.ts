// @vitest-environment node
import { Blaze, ColdWallet, Core, Provider } from "@blaze-cardano/sdk";
import { makeUplcEvaluator } from "@blaze-cardano/vm";
import { beforeAll, expect, it, vi } from "vitest";
import { DingoProvider } from "../dingo/utxorpc/DingoProvider";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { phaseTwoParams } from "../kernel/phaseTwo.fixture";
import type { Cip30WalletApi } from "../dingo/cip30";
import { rapidFixture } from "./fixtures";
import {
  constructor,
  decodeRapidPool,
  fields,
  quoteRapidSwap,
  RAPID_POOL_HASH,
  RAPID_REFERENCE,
} from "./data";
import { readRapidPool } from "./read";
import { prepareRapidSwap, submitRapidSwap } from "./transactions";
import scriptFixture from "./pool-script.fixture.json";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 },
  DINGO_CONFIG: {
    blockfrostUrl: "http://localhost:3000",
    utxorpcUrl: "http://localhost:9090",
  },
}));
vi.mock("../dingo/blaze", () => ({ getBlaze: vi.fn() }));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("./read", () => ({
  assertRapidMainnet: vi.fn(),
  readRapidPool: vi.fn(),
}));
beforeAll(() => Core.initCrypto());
const point = (input: Core.TransactionInput) =>
  `${input.transactionId()}#${input.index()}`;
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
async function setup(feeFrom?: bigint) {
  vi.clearAllMocks();
  const clock = { slot: 200000000 };
  vi.mocked(blockfrostFetch).mockImplementation(async <T>(path: string) => {
    if (path === "/api/v0/epochs/latest/parameters") return phaseTwoParams as T;
    if (path === "/api/v0/blocks/latest") return { slot: clock.slot } as T;
    throw new Error(path);
  });
  const ledger = new Ledger(await new DingoProvider().getParameters()),
    utxo = rapidFixture(feeFrom == null ? 0 : 1);
  if (feeFrom != null) {
    const values = fields(utxo.output().datum()!.asInlineData()!, 15);
    values[6] = constructor(feeFrom, []);
    utxo.output().setDatum(Core.Datum.newInlineData(constructor(0n, values)));
  }
  const pool = decodeRapidPool(utxo);
  ledger.outputs.set(point(utxo.input()), utxo);
  const script = Core.Script.fromCbor(Core.HexBlob(scriptFixture.cbor));
  expect(script.hash()).toBe(RAPID_POOL_HASH);
  const referenceOutput = new Core.TransactionOutput(
    pool.utxo.output().address(),
    new Core.Value(30000000n),
  );
  referenceOutput.setScriptRef(script);
  const reference = new Core.TransactionUnspentOutput(
    new Core.TransactionInput(
      Core.TransactionId(RAPID_REFERENCE.hash),
      BigInt(RAPID_REFERENCE.index),
    ),
    referenceOutput,
  );
  ledger.outputs.set(point(reference.input()), reference);
  const key = Core.Ed25519PrivateKey.fromNormalHex(
      Core.Ed25519PrivateNormalKeyHex("11".repeat(32)),
    ),
    address = Core.addressFromCredential(
      1,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: key.toPublic().hash().hex(),
      }),
    );
  for (let index = 0; index < 3; index++) {
    const value = new Core.Value(index === 0 ? 1000000000n : 50000000n);
    if (index === 0)
      value.setMultiasset(new Map([[Core.AssetId(pool.assetB), 1000000000n]]));
    const output = new Core.TransactionUnspentOutput(
      new Core.TransactionInput(
        Core.TransactionId("22".repeat(32)),
        BigInt(index),
      ),
      new Core.TransactionOutput(address, value),
    );
    ledger.outputs.set(point(output.input()), output);
  }
  const api = {
    getNetworkId: vi.fn(async () => 1),
    getChangeAddress: async () => address.toBytes(),
    getUtxos: async () =>
      (await ledger.getUnspentOutputs(address)).map((utxo) => utxo.toCbor()),
    getCollateral: async () =>
      (await ledger.getUnspentOutputs(address))
        .filter((utxo) => !utxo.output().amount().multiasset()?.size)
        .map((utxo) => utxo.toCbor()),
  } as unknown as Cip30WalletApi;
  const blaze = await Blaze.from(ledger, new ColdWallet(address, 1, ledger));
  vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<
    ReturnType<typeof getBlaze>
  >);
  vi.mocked(readRapidPool).mockImplementation(async () =>
    decodeRapidPool(ledger.outputs.get(point(utxo.input()))!),
  );
  return { ledger, pool, api, blaze, key, clock, address };
}
it.each([0n, 1n, 2n, 3n])(
  "evaluates both swap directions against the deployed script with fee mode %s",
  async (feeFrom) => {
    for (const aToB of [true, false]) {
      const f = await setup(feeFrom),
        amount = aToB ? 1000000n : 10000000n,
        quote = quoteRapidSwap(f.pool, aToB, amount);
      const draft = await prepareRapidSwap(
        f.api,
        { poolName: f.pool.name, aToB, amount, minimum: quote.received },
        () => {},
      );
      expect(f.ledger.evaluations).toBeGreaterThan(0);
      expect(draft.tx.body().mint()?.size ?? 0).toBe(0);
      const next = decodeRapidPool(
        new Core.TransactionUnspentOutput(
          new Core.TransactionInput(draft.tx.getId(), 0n),
          draft.tx.body().outputs()[0],
        ),
      );
      expect(next.reserveA + next.treasuryA).toBe(
        f.pool.reserveA + f.pool.treasuryA + quote.deltaA,
      );
      expect(next.reserveB + next.treasuryB).toBe(
        f.pool.reserveB + f.pool.treasuryB + quote.deltaB,
      );
      expect(next.issuedShares).toBe(f.pool.issuedShares);
    }
  },
);
it("rejects a quote below the reviewed output before building", async () => {
  const f = await setup();
  const quote = quoteRapidSwap(f.pool, true, 1000000n);
  await expect(
    prepareRapidSwap(
      f.api,
      {
        poolName: f.pool.name,
        aToB: true,
        amount: 1000000n,
        minimum: quote.received + 1n,
      },
      () => {},
    ),
  ).rejects.toThrow("below the reviewed amount");
  expect(getBlaze).not.toHaveBeenCalled();
});
it("rejects a consumed pool before wallet approval", async () => {
  const f = await setup();
  const draft = await prepareRapidSwap(
    f.api,
    { poolName: f.pool.name, aToB: true, amount: 1000000n, minimum: 1n },
    () => {},
  );
  f.ledger.outputs.delete(point(f.pool.utxo.input()));
  const sign = vi.spyOn(f.blaze, "signTransaction");
  await expect(submitRapidSwap(f.api, draft, () => {})).rejects.toThrow(
    "pool or reference changed",
  );
  expect(sign).not.toHaveBeenCalled();
  sign.mockRestore();
});
it("checks wallet network identity before building", async () => {
  const f = await setup();
  vi.mocked(f.api.getNetworkId).mockResolvedValue(0);
  await expect(
    prepareRapidSwap(
      f.api,
      { poolName: f.pool.name, aToB: true, amount: 1000000n, minimum: 1n },
      () => {},
    ),
  ).rejects.toThrow("Wallet network changed.");
  expect(getBlaze).not.toHaveBeenCalled();
});
it.each(["body", "expiry", "signature"] as const)(
  "rejects a %s failure while signing",
  async (kind) => {
    const f = await setup(),
      draft = await prepareRapidSwap(
        f.api,
        { poolName: f.pool.name, aToB: true, amount: 1000000n, minimum: 1n },
        () => {},
      );
    const sign = vi
      .spyOn(f.blaze, "signTransaction")
      .mockImplementation(async (tx) => {
        if (kind === "expiry") f.clock.slot = draft.validUntil;
        if (kind === "body") {
          const body = Core.TransactionBody.fromCbor(tx.body().toCbor());
          body.setFee(body.fee() + 1n);
          return new Core.Transaction(body, new Core.TransactionWitnessSet());
        }
        return Core.Transaction.fromCbor(tx.toCbor());
      });
    const post = vi.spyOn(f.ledger, "postTransactionToChain");
    await expect(submitRapidSwap(f.api, draft, () => {})).rejects.toThrow(
      kind === "body"
        ? "Wallet changed the reviewed WingRiders Rapid transaction."
        : kind === "expiry"
          ? "WingRiders Rapid draft expired."
          : "Wallet did not sign every WingRiders Rapid funding key.",
    );
    expect(post).not.toHaveBeenCalled();
    sign.mockRestore();
    post.mockRestore();
  },
);
it("verifies a real wallet signature and passes the signed transaction to the provider", async () => {
  const f = await setup(),
    draft = await prepareRapidSwap(
      f.api,
      { poolName: f.pool.name, aToB: true, amount: 1000000n, minimum: 1n },
      () => {},
    );
  const sign = vi
    .spyOn(f.blaze, "signTransaction")
    .mockImplementation(async (tx) => {
      const signed = Core.Transaction.fromCbor(tx.toCbor()),
        witnesses = Core.TransactionWitnessSet.fromCbor(
          tx.witnessSet().toCbor(),
        );
      witnesses.setVkeys(
        Core.CborSet.fromCore(
          [
            [
              f.key.toPublic().hex(),
              f.key.sign(Core.HexBlob(signed.getId())).hex(),
            ],
          ],
          Core.VkeyWitness.fromCore,
        ),
      );
      signed.setWitnessSet(witnesses);
      return signed;
    });
  const post = vi
    .spyOn(f.ledger, "postTransactionToChain")
    .mockResolvedValue(draft.tx.getId());
  await expect(submitRapidSwap(f.api, draft, () => {})).resolves.toBe(
    String(draft.tx.getId()),
  );
  expect(post).toHaveBeenCalledTimes(1);
  sign.mockRestore();
  post.mockRestore();
});
