// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
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
