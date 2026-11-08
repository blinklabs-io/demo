// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { authenticatePool } from "./data";
import { poolFixtures as preprodPoolFixtures } from "./fixtures";
import { PREPROD_MINSWAP_V2, minswapDeployment, minswapOrderReference } from "./constants";
import {
  prepareMinswapAction,
  prepareMinswapCancel,
  submitMinswapTransaction,
} from "./transactions";
import {
  constr,
  decodeOrder,
  orderAddress,
  orderDatum,
  type MinswapAction,
} from "./orders";
import { orderScriptCbor, mainnetOrderScriptCbor } from "./script.fixture";
const network = vi.hoisted(() => ({ id: "preprod", label: "Preprod", networkMagic: 1, cardanoId: 0 }));
const rpcPage = vi.hoisted(() => vi.fn());
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: network, DINGO_CONFIG: { utxorpcUrl: "http://127.0.0.1:9090", blockfrostUrl: "http://127.0.0.1:3000" } }));
vi.mock("../dingo/networkIdentity", () => ({ get CARDANO_NETWORK_ID() { return network.cardanoId; } }));
vi.mock("./rpc", () => ({ minswapAssetReader: async () => rpcPage, readMinswapAssetPage: (...args: unknown[]) => rpcPage(...args) }));
function poolFixtures() {
  return preprodPoolFixtures.map((row) => network.id === "preprod" ? structuredClone(row) : ({
    ...structuredClone(row), address: minswapDeployment().poolCreationAddress,
    amount: row.amount.map((asset) => ({ ...asset, unit: asset.unit.replace(PREPROD_MINSWAP_V2.lpPolicyId, minswapDeployment().lpPolicyId) })),
  }));
}
vi.mock("../dingo/blaze", async (original) => ({
  ...(await original<typeof import("../dingo/blaze")>()),
  getBlaze: vi.fn(),
}));
vi.mock("../dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
const fundingResolver = vi.hoisted(() => vi.fn());
vi.mock("../dingo/utxorpc/provider", async (original) => ({
  ...(await original<typeof import("../dingo/utxorpc/provider")>()),
  getDingoProvider: () => ({
    queryClient: { readGenesis: async () => ({ networkMagic: network.networkMagic }) },
    resolveUnspentOutputs: fundingResolver,
  }),
}));
beforeAll(async () => {
  await Core.initCrypto();
});
describe.each([
  ["preprod", "Preprod", 1, 0], ["mainnet", "Mainnet", 764824073, 1],
] as const)("%s Minswap transactions", (id, label, magic, cardanoId) => {
  beforeEach(() => { Object.assign(network, { id, label, networkMagic: magic, cardanoId }); vi.clearAllMocks(); rpcPage.mockImplementation(async () => ({ rows: [poolFixtures()[1]], nextToken: "" })); });
function fixture() {
  const pool = authenticatePool(poolFixtures()[1]);
  const key = Core.Ed25519PrivateKey.fromNormalHex(
    Core.Ed25519PrivateNormalKeyHex("11".repeat(32)),
  );
  let change = Core.addressFromCredential(
    network.cardanoId,
    Core.Credential.fromCore({
      type: Core.CredentialType.KeyHash,
      hash: key.toPublic().hash().hex(),
    }),
  );
  const original = change;
  const input = new Core.TransactionInput(
    Core.TransactionId("44".repeat(32)),
    0n,
  );
  const funding = new Core.TransactionUnspentOutput(
    input,
    new Core.TransactionOutput(change, new Core.Value(1000000000n)),
  );
  const unspent = new Map([[`${input.transactionId()}#0`, funding]]);
  let locked: Core.TransactionOutput | undefined,
    spent: Core.TransactionUnspentOutput | undefined,
    reference: Core.TransactionUnspentOutput | undefined,
    required: Core.Ed25519KeyHashHex | undefined,
    active = true,
    slot = 100,
    magic = network.networkMagic,
    corrupt = false,
    used: string[] = [],
    ttl: Core.Slot | undefined;
  const api = {
    getNetworkId: async () => network.cardanoId,
    getChangeAddress: async () => change.toBytes(),
    getUsedAddresses: async () => used,
    getUtxos: async () => [funding.toCbor()],
    getCollateral: async () => [],
  } as unknown as Cip30WalletApi;
  fundingResolver.mockImplementation(async (inputs: Core.TransactionInput[]) =>
    inputs.flatMap(
      (i) => unspent.get(`${i.transactionId()}#${i.index()}`) ?? [],
    ),
  );
  const assert = () => {
    if (!active) throw new Error("Session changed");
  };
  const builder = {
    lockAssets: vi.fn(
      (address: Core.Address, value: Core.Value, datum: Core.Datum) => {
        locked = new Core.TransactionOutput(address, value);
        locked.setDatum(datum);
        return builder;
      },
    ),
    addRequiredSigner: vi.fn((key: Core.Ed25519KeyHashHex) => {
      required = key;
      return builder;
    }),
    setValidUntil: vi.fn((value: Core.Slot) => {
      ttl = value;
      return builder;
    }),
    addInput: vi.fn(
      (...input: [Core.TransactionUnspentOutput, Core.PlutusData]) => {
        spent = input[0];
        return builder;
      },
    ),
    addReferenceInput: vi.fn((utxo: Core.TransactionUnspentOutput) => {
      reference = utxo;
      return builder;
    }),
    complete: vi.fn(async () => {
      const outputs = locked
        ? [locked]
        : [new Core.TransactionOutput(change, new Core.Value(9000000n))];
      if (corrupt) {
        const changed = new Core.TransactionOutput(
          outputs[0].address(),
          new Core.Value(1n),
        );
        if (outputs[0].datum()) changed.setDatum(outputs[0].datum()!);
        outputs[0] = changed;
      }
      const inputs = [input, ...(spent ? [spent.input()] : [])];
      const body = new Core.TransactionBody(
        Core.CborSet.fromCore(
          inputs.map((i) => i.toCore()),
          Core.TransactionInput.fromCore,
        ),
        outputs,
        170000n,
      );
      if (ttl !== undefined) body.setTtl(ttl);
      if (required)
        body.setRequiredSigners(
          Core.CborSet.fromCore([required], Core.Hash.fromCore),
        );
      if (reference)
        body.setReferenceInputs(
          Core.CborSet.fromCore(
            [reference.input().toCore()],
            Core.TransactionInput.fromCore,
          ),
        );
      return new Core.Transaction(body, new Core.TransactionWitnessSet());
    }),
  };
  const post = vi.fn(async (tx: Core.Transaction) => tx.getId());
  const sign = vi.fn(async (tx: Core.Transaction) => {
    const signed = Core.Transaction.fromCbor(tx.toCbor()),
      witness = new Core.TransactionWitnessSet();
    witness.setVkeys(
      Core.CborSet.fromCore(
        [[key.toPublic().hex(), key.sign(Core.HexBlob(tx.getId())).hex()]],
        Core.VkeyWitness.fromCore,
      ),
    );
    signed.setWitnessSet(witness);
    return signed;
  });
  vi.mocked(getBlaze).mockResolvedValue({
    blaze: {
      newTransaction: () => builder,
      signTransaction: sign,
      provider: {
        postTransactionToChain: post,
        resolveUnspentOutputs: fundingResolver,
      },
    },
  } as unknown as Awaited<ReturnType<typeof getBlaze>>);
  vi.mocked(blockfrostFetch).mockImplementation(async (path) => {
    if (path === "/api/v0/genesis") return { network_magic: magic };
    if (path === "/api/v0/blocks/latest") return { slot };
    if (path.includes("/scripts/"))
      return { script_hash: path.split("/").at(-1), type: "plutusV2" };
    if (path.includes("/utxos/")) return [poolFixtures()[1]];
    throw new Error(`Unexpected read ${path}`);
  });
  return {
    pool,
    key,
    original,
    api,
    assert,
    builder,
    sign,
    post,
    unspent,
    setUsed: (values: string[]) => {
      used = values;
    },
    setSlot: (n: number) => {
      slot = n;
    },
    setMagic: (n: number) => {
      magic = n;
    },
    corrupt: () => {
      corrupt = true;
    },
    disconnect: () => {
      active = false;
    },
    changeAccount: () => {
      change = Core.addressFromCredential(
        network.cardanoId,
        Core.Credential.fromCore({
          type: Core.CredentialType.KeyHash,
          hash: Core.Hash28ByteBase16("22".repeat(28)),
        }),
      );
    },
  };
}
it.each<MinswapAction>([
  { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
  { kind: "swap", direction: "b-to-a", amount: 1000000n, slippageBps: 50 },
  { kind: "deposit", amountA: 1000000n, amountB: 1000000n, slippageBps: 50 },
  { kind: "withdraw", lpAmount: 100000n, slippageBps: 50 },
])(
  "builds $kind as an exact inline order with transparent batcher fee and refundable deposit",
  async (action) => {
    const f = fixture();
    const draft = await prepareMinswapAction(f.api, f.pool, action, f.assert);
    const output = draft.tx.body().outputs()[0];
    expect(output.address().getProps().paymentPart?.hash).toBe(
      minswapDeployment().orderScriptHash,
    );
    expect(
      decodeOrder({
        ...poolFixtures()[0],
        address: output.address().toBech32(),
        inline_datum: output.datum()!.asInlineData()!.toCbor(),
      }).kind,
    ).toBe(action.kind);
    expect(draft.batcherFee).toBe(2000000n);
    expect(draft.deposit).toBe(2000000n);
    const offered =
      action.kind === "swap"
        ? [
            [
              action.direction === "a-to-b" ? f.pool.assetA : f.pool.assetB,
              action.amount,
            ] as const,
          ]
        : action.kind === "deposit"
          ? [
              [f.pool.assetA, action.amountA] as const,
              [f.pool.assetB, action.amountB] as const,
            ]
          : [[f.pool.lpAsset, action.lpAmount] as const];
    expect(output.amount().coin()).toBe(
      4000000n +
        offered.reduce(
          (sum, [unit, amount]) => sum + (unit === "lovelace" ? amount : 0n),
          0n,
        ),
    );
    expect(output.amount().multiasset() ?? new Map()).toEqual(
      new Map(
        offered
          .filter(([unit]) => unit !== "lovelace")
          .map(([unit, amount]) => [Core.AssetId(unit), amount]),
      ),
    );
    expect(draft.validUntil).toBe(700);
    expect(f.builder.setValidUntil).toHaveBeenCalledWith(
      Core.Slot(draft.validUntil),
    );
    expect(draft.tx.body().ttl()).toBe(draft.validUntil);
    expect(f.sign).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
    await expect(
      submitMinswapTransaction(f.api, draft, f.assert),
    ).resolves.toBe(draft.txHash);
    expect(f.post).toHaveBeenCalledOnce();
  },
);
it("rejects wrong genesis and altered output before requesting a signature", async () => {
  const f = fixture(),
    action = {
      kind: "swap",
      direction: "a-to-b",
      amount: 1000000n,
      slippageBps: 50,
    } as const;
  f.setMagic(2);
  await expect(
    prepareMinswapAction(f.api, f.pool, action, f.assert),
  ).rejects.toThrow(`verified ${network.label}`);
  f.setMagic(network.networkMagic);
  f.corrupt();
  await expect(
    prepareMinswapAction(f.api, f.pool, action, f.assert),
  ).rejects.toThrow("differs from the reviewed");
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
});
it("does not submit after the wallet account changes during the signature prompt", async () => {
  const f = fixture(),
    draft = await prepareMinswapAction(
      f.api,
      f.pool,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    );
  f.sign.mockImplementation(async (tx) => {
    f.changeAccount();
    return tx;
  });
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("account changed while signing");
  expect(f.post).not.toHaveBeenCalled();
});
it("does not submit missing required signatures or an expired draft", async () => {
  const f = fixture(),
    draft = await prepareMinswapAction(
      f.api,
      f.pool,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    );
  f.sign.mockImplementation(async (tx) => tx);
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("required Minswap funding key");
  f.setSlot(draft.validUntil);
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("expired");
  expect(f.post).not.toHaveBeenCalled();
});
it("cancels only the owner's current order with the canonical reference script and owner redeemer", async () => {
  const f = fixture(),
    datum = orderDatum(
      f.original,
      f.pool.lpAsset,
      { kind: "withdraw", lpAmount: 1000n, slippageBps: 50 },
      { minimumA: 1n, minimumB: 1n },
    );
  const input = new Core.TransactionInput(
      Core.TransactionId("55".repeat(32)),
      0n,
    ),
    output = new Core.TransactionOutput(
      orderAddress(f.original),
      new Core.Value(4000000n),
    );
  output.setDatum(Core.Datum.newInlineData(datum));
  const orderUtxo = new Core.TransactionUnspentOutput(input, output);
  f.unspent.set(`${input.transactionId()}#0`, orderUtxo);
  const reference = new Core.TransactionInput(
      Core.TransactionId(
        minswapOrderReference().txHash,
      ),
      0n,
    ),
    refOutput = new Core.TransactionOutput(
      f.original,
      new Core.Value(12000000n),
    );
  const script = Core.Script.newPlutusV2Script(
    new Core.PlutusV2Script(Core.HexBlob(network.id === "mainnet" ? mainnetOrderScriptCbor : orderScriptCbor)),
  );
  expect(script.hash()).toBe(minswapDeployment().orderScriptHash);
  refOutput.setScriptRef(script);
  f.unspent.set(
    `${reference.transactionId()}#0`,
    new Core.TransactionUnspentOutput(reference, refOutput),
  );
  const order = decodeOrder({
    ...poolFixtures()[0],
    address: output.address().toBech32(),
    tx_hash: input.transactionId(),
    output_index: 0,
    inline_datum: datum.toCbor(),
  });
  refOutput.setScriptRef(
    Core.Script.newPlutusV2Script(new Core.PlutusV2Script(Core.HexBlob("00"))),
  );
  await expect(prepareMinswapCancel(f.api, order, f.assert)).rejects.toThrow(
    "canonical Minswap cancellation reference",
  );
  refOutput.setScriptRef(script);
  const draft = await prepareMinswapCancel(f.api, order, f.assert);
  expect(
    f.builder.addInput.mock.calls[0][1]?.asConstrPlutusData()?.getAlternative(),
  ).toBe(1n);
  await expect(submitMinswapTransaction(f.api, draft, f.assert)).resolves.toBe(
    draft.txHash,
  );
  f.changeAccount();
  f.setUsed([f.original.toBytes()]);
  const rotated = await prepareMinswapCancel(f.api, order, f.assert);
  expect(rotated.tx.body().requiredSigners()!.toCore()).toContain(
    f.original.getProps().paymentPart!.hash,
  );
  expect(rotated.keys).toContain(f.original.getProps().paymentPart!.hash);
  f.setUsed([]);
  await expect(prepareMinswapCancel(f.api, order, f.assert)).rejects.toThrow(
    "cancellation key",
  );
  f.unspent.delete(`${input.transactionId()}#0`);
  await expect(prepareMinswapCancel(f.api, order, f.assert)).rejects.toThrow(
    "already been spent",
  );
  expect(f.post).toHaveBeenCalledOnce();
});

it("rejects a changed body and spent funding after the wallet prompt", async () => {
  const f = fixture(),
    draft = await prepareMinswapAction(
      f.api,
      f.pool,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    );
  const validSign = f.sign.getMockImplementation()!;
  f.sign.mockImplementation(async (tx) => {
    const signed = await validSign(tx),
      body = signed.body();
    body.setFee(body.fee() + 1n);
    signed.setBody(body);
    return signed;
  });
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("changed the reviewed");
  f.sign.mockImplementation(async (tx) => {
    const signed = await validSign(tx);
    f.unspent.clear();
    return signed;
  });
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("funding is not available");
  expect(f.post).not.toHaveBeenCalled();
});

it("does not broadcast a transaction that expires during the wallet prompt", async () => {
  const f = fixture(),
    draft = await prepareMinswapAction(
      f.api,
      f.pool,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    );
  const sign = f.sign.getMockImplementation()!;
  f.sign.mockImplementation(async (tx) => {
    const signed = await sign(tx);
    f.setSlot(draft.validUntil);
    return signed;
  });
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("expired while signing");
  expect(f.post).not.toHaveBeenCalled();
});

it("preserves the displayed minimum rather than silently repricing during build", async () => {
  const f = fixture(),
    row = structuredClone(poolFixtures()[1]);
  const fields = Core.PlutusData.fromCbor(Core.HexBlob(row.inline_datum!))
    .asConstrPlutusData()!
    .getData();
  const list = Array.from({ length: fields.getLength() }, (_, i) =>
    fields.get(i),
  );
  list[5] = Core.PlutusData.newInteger(f.pool.reserveB / 2n);
  row.inline_datum = constr(0, list).toCbor();
  row.amount.find((amount) => amount.unit === f.pool.assetB)!.quantity = String(
    f.pool.reserveB / 2n,
  );
  const displayed = authenticatePool(row);
  const { quoteSwap } = await import("./quotes");
  const expected = quoteSwap(displayed, "a-to-b", 1000000n, 50);
  const draft = await prepareMinswapAction(
    f.api,
    displayed,
    { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
    f.assert,
  );
  expect(draft.quote).toMatchObject(expected);
  const order = draft.tx
    .body()
    .outputs()[0]
    .datum()!
    .asInlineData()!
    .asConstrPlutusData()!
    .getData();
  expect(order.get(6).asConstrPlutusData()!.getData().get(2).asInteger()).toBe(
    expected.minimum,
  );
  const worse = { ...displayed, reserveB: f.pool.reserveB * 2n };
  await expect(
    prepareMinswapAction(
      f.api,
      worse,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    ),
  ).rejects.toThrow("changed beyond your reviewed minimum");
  expect(f.sign).not.toHaveBeenCalled();
});

it("keeps the reviewed draft unsigned when signing mutates its argument and submission fails", async () => {
  const f = fixture();
  const draft = await prepareMinswapAction(
    f.api,
    f.pool,
    { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
    f.assert,
  );
  const original = draft.tx.toCbor(),
    sign = f.sign.getMockImplementation()!;
  f.sign.mockImplementation(async (tx) => {
    const signed = await sign(tx);
    tx.setWitnessSet(signed.witnessSet());
    return tx;
  });
  f.post.mockRejectedValueOnce(new Error("Submission unavailable"));
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("Submission unavailable");
  expect(draft.tx.toCbor()).toBe(original);
  await expect(submitMinswapTransaction(f.api, draft, f.assert)).resolves.toBe(
    draft.txHash,
  );
});

it("does not post after session loss during actual wallet signing", async () => {
  const f = fixture(),
    draft = await prepareMinswapAction(
      f.api,
      f.pool,
      { kind: "swap", direction: "a-to-b", amount: 1000000n, slippageBps: 50 },
      f.assert,
    );
  const sign = f.sign.getMockImplementation()!;
  f.sign.mockImplementation(async (tx) => {
    const result = await sign(tx);
    f.disconnect();
    return result;
  });
  await expect(
    submitMinswapTransaction(f.api, draft, f.assert),
  ).rejects.toThrow("Session changed");
  expect(f.sign).toHaveBeenCalledOnce();
  expect(f.post).not.toHaveBeenCalled();
});

});
