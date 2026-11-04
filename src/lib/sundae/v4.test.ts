// @vitest-environment node
import { beforeAll, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { AssetAmount } from "@sundaeswap/asset";
import {
  ADA_METADATA,
  DatumBuilderV4,
  EDatumType,
  EV4BasicConstraint,
} from "@sundaeswap/core";

beforeAll(async () => {
  await Core.initCrypto();
});

it("serializes a V4 order containing SDK PlutusData constraints without losing its minimum", () => {
  const builder = new DatumBuilderV4("preview");
  const owner = Core.Address.fromBytes(
    Core.HexBlob(`60${"11".repeat(28)}`),
  ).toBech32();
  const token = { assetId: `${"22".repeat(28)}.544f4b454e`, decimals: 0 };
  const constraint = builder.buildBasicConstraintData({
    type: EV4BasicConstraint.Swap,
    offered: [new AssetAmount(1000n, ADA_METADATA)],
    minReceived: [new AssetAmount(987n, token)],
  });
  const encoded = builder.buildOrderDatum({
    owner,
    destination: { address: owner, datum: { type: EDatumType.NONE } },
    budget: 3000000n,
    maxPerExecution: 3000000n,
    configToken: "33".repeat(32),
    constraints: [
      ["44".repeat(28), constraint],
      ["55".repeat(28), DatumBuilderV4.buildVoidData()],
    ],
  });
  const fields = Core.PlutusData.fromCbor(Core.HexBlob(encoded.inline))
    .asConstrPlutusData()!
    .getData();
  expect(fields.getLength()).toBe(7);
  expect(fields.get(2).asInteger()).toBe(3000000n);
  const constraints = fields.get(5).asList()!;
  const basic = constraints.get(0).asList()!.get(1);
  expect(basic.toCbor()).toBe(constraint.toCbor());
  const received = basic
    .asConstrPlutusData()!
    .getData()
    .get(1)
    .asList()!
    .get(0)
    .asList()!;
  expect(received.get(1).asInteger()).toBe(987n);
});

import { loadV4Pool, V4_DEPLOYMENT, type V4Pool } from "./v4";

function pdList(...items: Core.PlutusData[]) {
  const list = new Core.PlutusList();
  for (const item of items) list.add(item);
  return Core.PlutusData.newList(list);
}
function pdConstr(tag: bigint, ...items: Core.PlutusData[]) {
  const list = new Core.PlutusList();
  for (const item of items) list.add(item);
  return Core.PlutusData.newConstrPlutusData(
    new Core.ConstrPlutusData(tag, list),
  );
}
function rateUpdateFixture(wrongReference = false, operationTag = 7n) {
  const inputHash = "aa".repeat(32),
    ident = "11".repeat(28);
  const oldConfig =
    "d8799f18c8d8799f1819192710ff9f1a000f42401a000f4628ffd8799fd8799f581ce2afcadc7b111be7b89f283e9facffbbc5292f40fd13d7613e639c35ffffd87a80d8799fd8799f011864ffffff";
  const updatedConfig =
    "d8799f18c8d8799f1819192710ff9f1a000f42401a000f4a10ffd8799fd8799f581ce2afcadc7b111be7b89f283e9facffbbc5292f40fd13d7613e639c35ffffd87a80d8799fd8799f011864ffffff";
  const commitment = String(Core.blake2b_256(Core.HexBlob(updatedConfig)));
  const token = { assetId: `${"22".repeat(28)}.544f4b454e`, decimals: 0 };
  const assets = [ADA_METADATA, token];
  const builder = new DatumBuilderV4("preview");
  const datum = builder.buildPoolDatum({
    assets: assets.map((a) => new AssetAmount(1000000000n, a)),
    totalLp: 1000000n,
    circulatingLp: 1000000n,
    premintedLp: 0n,
    identifier: ident,
    actions: [
      { tag: 100n, enabled: true, modules: [V4_DEPLOYMENT.stableswap] },
    ],
    moduleState: [[V4_DEPLOYMENT.stableswap, commitment]],
    minSurplus: 5000000n,
  });
  const address = Core.addressFromCredential(
    0,
    Core.Credential.fromCore({
      type: Core.CredentialType.ScriptHash,
      hash: Core.Hash28ByteBase16(V4_DEPLOYMENT.pool),
    }),
  );
  const native = new Map([
    [Core.AssetId(token.assetId.replace(".", "")), 1000000000n],
    [
      Core.AssetId(
        V4_DEPLOYMENT.poolPolicy + DatumBuilderV4.cip68Names(ident).nft,
      ),
      1n,
    ],
  ]);
  const output = new Core.TransactionOutput(
    address,
    new Core.Value(1005000000n, native),
  );
  output.setDatum(
    Core.Datum.newInlineData(
      Core.PlutusData.fromCbor(Core.HexBlob(datum.inline)),
    ),
  );
  const input = new Core.TransactionInput(Core.TransactionId(inputHash), 0n);
  const body = new Core.TransactionBody(
    Core.CborSet.fromCore([input.toCore()], Core.TransactionInput.fromCore),
    [output],
    0n,
  );
  body.setWithdrawals(
    new Map([
      [
        Core.RewardAccount.fromCredential(
          {
            type: Core.CredentialType.ScriptHash,
            hash: Core.Hash28ByteBase16(V4_DEPLOYMENT.stableswap),
          },
          0,
        ),
        0n,
      ],
    ]),
  );
  const oref = pdConstr(
    0n,
    Core.PlutusData.newBytes(
      Core.fromHex(wrongReference ? "bb".repeat(32) : inputHash),
    ),
    Core.PlutusData.newInteger(0n),
  );
  const moduleOperate = pdConstr(
    1n,
    pdList(
      pdConstr(
        0n,
        oref,
        Core.PlutusData.fromCbor(Core.HexBlob(oldConfig)),
        Core.PlutusData.newInteger(2000000000n),
      ),
    ),
  );
  const newRates = pdList(
    Core.PlutusData.newInteger(1000000n),
    Core.PlutusData.newInteger(1002000n),
  );
  const update = pdConstr(
    0n,
    newRates,
    Core.PlutusData.newInteger(2000000000n),
  );
  const state = pdConstr(
    0n,
    pdList(),
    Core.PlutusData.newInteger(1000000n),
    Core.PlutusData.newInteger(1000000n),
    Core.PlutusData.newInteger(0n),
  );
  const transcript = pdList(
    pdConstr(
      0n,
      state,
      Core.PlutusData.newInteger(0n),
      Core.PlutusData.newInteger(operationTag),
      update,
    ),
  );
  const poolAction = pdConstr(
    3n,
    Core.PlutusData.newInteger(100n),
    transcript,
    Core.PlutusData.newInteger(0n),
    Core.PlutusData.newInteger(0n),
  );
  const witness = new Core.TransactionWitnessSet();
  witness.setRedeemers(
    Core.Redeemers.fromCore([
      new Core.Redeemer(
        Core.RedeemerTag.Spend,
        0n,
        poolAction,
        new Core.ExUnits(1n, 1n),
      ).toCore(),
      new Core.Redeemer(
        Core.RedeemerTag.Reward,
        0n,
        moduleOperate,
        new Core.ExUnits(1n, 1n),
      ).toCore(),
    ]),
  );
  const tx = new Core.Transaction(body, witness),
    hash = String(tx.getId());
  const pool: V4Pool = {
    ident,
    output: {
      address: address.toBech32(),
      tx_hash: hash,
      output_index: 0,
      amount: [],
      inline_datum: datum.inline,
    },
    assets,
    reserves: [1000000000n, 1000000000n],
    curveHash: V4_DEPLOYMENT.stableswap,
    curveLabel: "Stableswap",
    configHashes: new Map([[V4_DEPLOYMENT.stableswap, commitment]]),
    lp: 1000000n,
  };
  return { tx, pool, updatedConfig };
}

it("quotes the output-committed stableswap rates reconstructed from a canonical tag-7 transcript", async () => {
  const fixture = rateUpdateFixture();
  expect(fixture.tx.toCbor()).not.toContain(fixture.updatedConfig);
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ cbor: fixture.tx.toCbor() }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  try {
    const pool = await loadV4Pool(fixture.pool);
    expect(pool.rates).toEqual([1000000n, 1002000n]);
    expect(pool.linearAmplificationFactor).toBe(200n);
    expect(pool.currentFee).toBe(0.0025);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    fetch.mockRestore();
  }
});

it.each([
  [true, 7n],
  [false, 6n],
] as const)(
  "does not splice a rate update from another input or operation (%s,%s)",
  async (wrongReference, tag) => {
    const fixture = rateUpdateFixture(wrongReference, tag);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ cbor: fixture.tx.toCbor() }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    try {
      await expect(loadV4Pool(fixture.pool)).rejects.toThrow(
        /committed curve configuration/,
      );
    } finally {
      fetch.mockRestore();
    }
  },
);

it("rejects a reconstructed rate update whose full config does not match the output commitment", async () => {
  const { tx, pool } = rateUpdateFixture();
  pool.configHashes.set(V4_DEPLOYMENT.stableswap, "00".repeat(32));
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ cbor: tx.toCbor() }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  try {
    await expect(loadV4Pool(pool)).rejects.toThrow(
      /committed curve configuration/,
    );
  } finally {
    request.mockRestore();
  }
});
