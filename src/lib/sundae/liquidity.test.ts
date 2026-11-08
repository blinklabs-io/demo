// @vitest-environment node
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import {
  ADA_METADATA,
  DatumBuilderV3,
  EContractVersion,
  TxBuilderV3,
  type IPoolData,
} from "@sundaeswap/core";
import { getBlaze } from "../dingo/blaze";
import { DingoSundaeQueryProvider } from "./dingoQueryProvider";
import {
  prepareLiquidity,
  prepareLiquidityCancel,
  quoteLiquidity,
} from "./liquidity";
import type { Cip30WalletApi } from "../dingo/cip30";
import { SUNDAE_V3_PROTOCOL } from "./protocol";
const state = vi.hoisted(() => ({ slot: 100, active: true }));
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 },
  DINGO_CONFIG: {},
}));
vi.mock("../dingo/blaze", () => ({ getBlaze: vi.fn() }));
vi.mock("../dingo/blockfrost", () => ({
  blockfrostFetch: async () => ({ slot: state.slot, network_magic: 764824073 }),
}));
vi.mock("../dingo/utxorpc/provider", () => ({
  assertDingoNetwork: vi.fn(),
  getDingoProvider: vi.fn(),
}));
beforeAll(async () => {
  await Core.initCrypto();
});
beforeEach(() => {
  state.slot = 100;
  state.active = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});
function fixture() {
  const key = Core.Ed25519PrivateKey.fromNormalHex(
    Core.Ed25519PrivateNormalKeyHex("11".repeat(32)),
  );
  let address = Core.addressFromCredential(
    1,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: key.toPublic().hash().hex(),
    }),
  );
  let network = 1;
  const pool: IPoolData = {
    ident: "aa".repeat(28),
    version: EContractVersion.V3,
    currentFee: 0.003,
    assetA: ADA_METADATA,
    assetB: { assetId: "22".repeat(28) + ".544f4b454e", decimals: 0 },
    assetLP: {
      assetId: "33".repeat(28) + ".0014df10" + "aa".repeat(28),
      decimals: 0,
    },
    liquidity: {
      aReserve: 1000000000n,
      bReserve: 1000000n,
      lpTotal: 10000000n,
    },
  };
  const input = new Core.TransactionInput(
    Core.TransactionId("44".repeat(32)),
    0n,
  );
  const funding = new Core.TransactionUnspentOutput(
    input,
    new Core.TransactionOutput(address, new Core.Value(100000000n)),
  );
  const outputs: Core.TransactionOutput[] = [];
  const spending: Core.TransactionInput[] = [input];
  const extra: Core.TransactionUnspentOutput[] = [];
  const required: Core.Ed25519KeyHashHex[] = [];
  const body = () =>
    new Core.TransactionBody(
      Core.CborSet.fromCore(
        spending.map((item) => item.toCore()),
        Core.TransactionInput.fromCore,
      ),
      outputs.length ? outputs : [funding.output()],
      170000n,
    );
  let transaction: Core.Transaction;
  const complete = vi.fn(async () => {
    const nextBody = body();
    if (required.length)
      nextBody.setRequiredSigners(
        Core.CborSet.fromCore(required, Core.Hash.fromCore),
      );
    transaction = new Core.Transaction(
      nextBody,
      new Core.TransactionWitnessSet(),
    );
    return transaction;
  });
  const transactionBuilder = {
    lockAssets: vi.fn(
      (target: Core.Address, amount: Core.Value, datum: Core.PlutusData) => {
        const output = new Core.TransactionOutput(target, amount);
        output.setDatum(Core.Datum.newInlineData(datum));
        outputs.push(output);
        return transactionBuilder;
      },
    ),
    addInput: vi.fn((utxo: Core.TransactionUnspentOutput) => {
      spending.push(utxo.input());
      return transactionBuilder;
    }),
    addReferenceInput: vi.fn().mockReturnThis(),
    addRequiredSigner: vi.fn((signer: Core.Ed25519KeyHashHex) => {
      required.push(signer);
      return transactionBuilder;
    }),
    enableTracing: vi.fn().mockReturnThis(),
    setValidUntil: vi.fn().mockReturnThis(),
    complete,
  };
  const sign = vi.fn(async (tx: Core.Transaction) => {
    const signed = Core.Transaction.fromCbor(tx.toCbor());
    const witnesses = new Core.TransactionWitnessSet();
    witnesses.setVkeys(
      Core.CborSet.fromCore(
        [[key.toPublic().hex(), key.sign(Core.HexBlob(signed.getId())).hex()]],
        Core.VkeyWitness.fromCore,
      ),
    );
    signed.setWitnessSet(witnesses);
    return signed;
  });
  const post = vi.fn(async (tx: Core.Transaction) => tx.getId());
  const resolve = vi.fn(async (inputs: Core.TransactionInput[]) =>
    inputs.flatMap((requested) =>
      [funding, ...extra].filter(
        (utxo) => utxo.input().toCbor() === requested.toCbor(),
      ),
    ),
  );
  const blaze = {
    provider: {
      networkName: "cardano-mainnet",
      resolveUnspentOutputs: resolve,
      postTransactionToChain: post,
    },
    wallet: { getChangeAddress: async () => address },
    newTransaction: () => transactionBuilder,
    signTransaction: sign,
  };
  vi.mocked(getBlaze).mockResolvedValue({ blaze } as unknown as Awaited<
    ReturnType<typeof getBlaze>
  >);
  const find = vi
    .spyOn(DingoSundaeQueryProvider.prototype, "findPoolDataByIdent")
    .mockResolvedValue(pool);
  vi.spyOn(TxBuilderV3.prototype, "getSettingsUtxoDatum").mockResolvedValue(
    "d87980",
  );
  vi.spyOn(TxBuilderV3.prototype, "getMaxScooperFeeAmount").mockResolvedValue(
    1000000n,
  );
  const api = { getNetworkId: async () => network } as Cip30WalletApi;
  const current = () => {
    if (!state.active) throw new Error("Session changed");
  };
  return {
    key,
    api,
    pool,
    current,
    find,
    complete,
    transactionBuilder,
    sign,
    post,
    resolve,
    outputs,
    extra,
    get tx() {
      return transaction;
    },
    switchNetwork: () => {
      network = 0;
    },
    switchAccount: () => {
      address = Core.Address.fromBytes(Core.HexBlob("61" + "77".repeat(28)));
    },
  };
}
it("quotes exact deposits and proportional withdrawals above Number precision", () => {
  const { pool } = fixture();
  expect(
    quoteLiquidity(pool, {
      type: "deposit",
      amountA: 5000000n,
      amountB: 5000n,
    }),
  ).toMatchObject({ lp: 50000n, changeA: 0n, changeB: 0n });
  pool.liquidity = {
    aReserve: 900719925474099300n,
    bReserve: 90071992547409930n,
    lpTotal: 9007199254740993n,
  };
  expect(
    quoteLiquidity(pool, { type: "withdraw", lp: 900719925474099n }),
  ).toMatchObject({ amountA: 90071992547409900n, amountB: 9007199254740990n });
  expect(() =>
    quoteLiquidity(pool, { type: "withdraw", lp: pool.liquidity.lpTotal }),
  ).toThrow("below");
  expect(() =>
    quoteLiquidity(pool, { type: "deposit", amountA: 0n, amountB: 1n }),
  ).toThrow("positive");
});
it.each(["deposit", "withdraw"] as const)(
  "builds a real SDK %s order datum and submits through Dingo after review",
  async (type) => {
    const f = fixture();
    const action =
      type === "deposit"
        ? { type, amountA: 5000000n, amountB: 5000n }
        : { type, lp: 50000n };
    const draft = await prepareLiquidity(f.api, f.pool, action, f.current);
    expect(f.sign).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    expect(draft.deposit).toBe(2000000n);
    expect(draft.scooperFee).toBe(1000000n);
    expect(f.transactionBuilder.setValidUntil).toHaveBeenCalledWith(700);
    expect(draft.orderReferences).toEqual([`${draft.tx.getId()}#0`]);
    expect(
      DatumBuilderV3.getSignerKeyFromDatum(
        f.outputs[0].datum()!.asInlineData()!.toCbor(),
      ),
    ).toBe(f.key.toPublic().hash().hex());
    expect(f.outputs[0].address().getNetworkId()).toBe(1);
    const values = f.outputs[0].amount();
    expect(values.coin()).toBe(type === "deposit" ? 8000000n : 3000000n);
    expect([...values.multiasset()!.values()]).toEqual([
      type === "deposit" ? 5000n : 50000n,
    ]);
    await draft.signAndSubmit();
    expect(f.post).toHaveBeenCalledTimes(1);
  },
);
it("rejects unavailable settings instead of using the SDK fee default", async () => {
  const f = fixture();
  vi.mocked(TxBuilderV3.prototype.getSettingsUtxoDatum).mockResolvedValue(
    undefined as unknown as string,
  );
  await expect(
    prepareLiquidity(
      f.api,
      f.pool,
      { type: "withdraw", lp: 50000n },
      f.current,
    ),
  ).rejects.toThrow("settings datum");
  expect(f.complete).not.toHaveBeenCalled();
});
it("requires a fresh review when the quote or pool identity changes", async () => {
  const f = fixture();
  f.find.mockResolvedValue({
    ...f.pool,
    liquidity: { ...f.pool.liquidity, aReserve: 2000000000n },
  });
  await expect(
    prepareLiquidity(
      f.api,
      f.pool,
      { type: "withdraw", lp: 50000n },
      f.current,
    ),
  ).rejects.toThrow("quote changed");
  f.find.mockResolvedValue({
    ...f.pool,
    assetB: { assetId: "55".repeat(28) + ".00", decimals: 0 },
  });
  await expect(
    prepareLiquidity(
      f.api,
      f.pool,
      { type: "withdraw", lp: 50000n },
      f.current,
    ),
  ).rejects.toThrow("assets changed");
  expect(f.sign).not.toHaveBeenCalled();
});
it.each(["network", "account", "session", "expiry"] as const)(
  "refuses a stale %s before signing",
  async (cause) => {
    const f = fixture();
    const draft = await prepareLiquidity(
      f.api,
      f.pool,
      { type: "withdraw", lp: 50000n },
      f.current,
    );
    if (cause === "network") f.switchNetwork();
    if (cause === "account") f.switchAccount();
    if (cause === "session") state.active = false;
    if (cause === "expiry") state.slot = 700;
    const message = {
      network: "Wallet network changed.",
      account: "Wallet account changed. Review a new order.",
      session: "Session changed",
      expiry: "The draft expired. Build a new order.",
    }[cause];
    await expect(draft.signAndSubmit()).rejects.toThrow(message);
    expect(f.sign).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
  },
);
it.each(["body", "network", "expiry", "witness"] as const)(
  "rejects %s changes while the wallet signs",
  async (cause) => {
    const f = fixture();
    const draft = await prepareLiquidity(
      f.api,
      f.pool,
      { type: "withdraw", lp: 50000n },
      f.current,
    );
    const original = f.sign.getMockImplementation()!;
    f.sign.mockImplementation(async (tx) => {
      const signed = await original(tx);
      if (cause === "network") f.switchNetwork();
      if (cause === "expiry") state.slot = 700;
      if (cause === "witness")
        signed.setWitnessSet(new Core.TransactionWitnessSet());
      if (cause === "body") {
        const changed = Core.TransactionBody.fromCbor(signed.body().toCbor());
        changed.setFee(999999n);
        return new Core.Transaction(changed, signed.witnessSet());
      }
      return signed;
    });
    const message = {
      body: "The wallet changed the reviewed transaction.",
      network: "Wallet network changed.",
      expiry: "The draft expired. Build a new order.",
      witness: "The wallet did not sign every required funding key.",
    }[cause];
    await expect(draft.signAndSubmit()).rejects.toThrow(message);
    expect(f.post).not.toHaveBeenCalled();
  },
);
it("rejects foreign and spent cancellation references before invoking the builder", async () => {
  const f = fixture();
  await expect(prepareLiquidityCancel(f.api, "bad", f.current)).rejects.toThrow(
    "reference",
  );
  const ref = "66".repeat(32) + "#0";
  f.resolve.mockResolvedValue([]);
  await expect(prepareLiquidityCancel(f.api, ref, f.current)).rejects.toThrow(
    "unspent",
  );
  const script = SUNDAE_V3_PROTOCOL.blueprint.validators.find(
    (v) => v.title === "order.spend",
  )!.hash;
  const output = new Core.TransactionOutput(
    Core.addressFromCredential(
      1,
      Core.Credential.fromCore({
        type: Core.CredentialType.ScriptHash,
        hash: Core.Hash28ByteBase16(script),
      }),
    ),
    new Core.Value(3000000n),
  );
  const foreign = Core.Address.fromBytes(
    Core.HexBlob("61" + "88".repeat(28)),
  ).toBech32();
  const datum = new DatumBuilderV3("mainnet").buildWithdrawDatum({
    ident: f.pool.ident,
    destinationAddress: { address: foreign, datum: { type: "NONE" as never } },
    order: { lpToken: { amount: 1n, metadata: f.pool.assetLP } as never },
    scooperFee: 1000000n,
  });
  output.setDatum(
    Core.Datum.newInlineData(
      Core.PlutusData.fromCbor(Core.HexBlob(datum.inline)),
    ),
  );
  f.resolve.mockResolvedValue([
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(Core.TransactionId("66".repeat(32)), 0n),
      output,
    ),
  ]);
  await expect(prepareLiquidityCancel(f.api, ref, f.current)).rejects.toThrow(
    "another wallet",
  );
  expect(f.complete).not.toHaveBeenCalled();
});

it("builds an owned cancellation through the SDK and returns funds without another scooper fee", async () => {
  const f = fixture();
  const order = await prepareLiquidity(
    f.api,
    f.pool,
    { type: "withdraw", lp: 50000n },
    f.current,
  );
  const ref = new Core.TransactionInput(order.tx.getId(), 0n);
  const orderUtxo = new Core.TransactionUnspentOutput(ref, f.outputs[0]);
  f.extra.push(orderUtxo);
  const reference = SUNDAE_V3_PROTOCOL.references.find(
    (entry) => entry.key === "order.spend",
  )!;
  f.extra.push(
    new Core.TransactionUnspentOutput(
      new Core.TransactionInput(
        Core.TransactionId(reference.txIn.hash),
        BigInt(reference.txIn.index),
      ),
      f.outputs[0],
    ),
  );
  f.outputs.length = 0;
  const draft = await prepareLiquidityCancel(
    f.api,
    `${ref.transactionId()}#0`,
    f.current,
  );
  expect(f.transactionBuilder.addInput).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    undefined,
  );
  expect(f.transactionBuilder.addRequiredSigner).toHaveBeenCalledWith(
    f.key.toPublic().hash().hex(),
  );
  expect(draft.deposit).toBe(0n);
  expect(draft.scooperFee).toBe(0n);
  await draft.signAndSubmit();
  expect(f.post).toHaveBeenCalledTimes(1);
});
