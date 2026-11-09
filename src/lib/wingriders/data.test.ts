// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { rapidFixture } from "./fixtures";
import {
  constructor,
  decodeRapidPool,
  fields,
  quoteRapidSwap,
  RAPID_MARKER,
  rapidSwapOutput,
} from "./data";
beforeAll(() => Core.initCrypto());
it.each([0, 1, 2, 3])(
  "authenticates mainnet pool fixture %s and separates treasury and ADA oil",
  (index) => {
    const utxo = rapidFixture(index),
      pool = decodeRapidPool(utxo);
    expect(pool.reserveA + pool.treasuryA + 2000000n).toBe(
      utxo.output().amount().coin(),
    );
    expect(pool.reserveB + pool.treasuryB).toBe(
      utxo.output().amount().multiasset()!.get(Core.AssetId(pool.assetB)),
    );
    expect(pool.issuedShares).toBeGreaterThan(0n);
  },
);
it.each(["network", "key", "marker"])("rejects a foreign %s", (kind) => {
  const original = rapidFixture(),
    value = Core.Value.fromCbor(original.output().amount().toCbor());
  const address = Core.addressFromCredential(
    kind === "network" ? 0 : 1,
    Core.Credential.fromCore({
      type:
        kind === "key"
          ? Core.CredentialType.KeyHash
          : Core.CredentialType.ScriptHash,
      hash: original.output().address().getProps().paymentPart!.hash,
    }),
  );
  if (kind === "marker") {
    const assets = value.multiasset()!;
    assets.set(Core.AssetId(RAPID_MARKER), 2n);
    value.setMultiasset(assets);
  }
  const output = new Core.TransactionOutput(address, value);
  output.setDatum(Core.Datum.fromCbor(original.output().datum()!.toCbor()));
  expect(() =>
    decodeRapidPool(
      new Core.TransactionUnspentOutput(original.input(), output),
    ),
  ).toThrow("Not an authenticated mainnet WingRiders Rapid pool.");
});
it("rejects malformed fees and quantities while retaining integer quote precision", () => {
  const utxo = rapidFixture(),
    values = fields(utxo.output().datum()!.asInlineData()!, 15);
  values[13] = Core.PlutusData.newInteger(0n);
  utxo.output().setDatum(Core.Datum.newInlineData(constructor(0n, values)));
  expect(() => decodeRapidPool(utxo)).toThrow(
    "Invalid WingRiders Rapid fee ratio.",
  );
  const pool = decodeRapidPool(rapidFixture());
  expect(() => quoteRapidSwap(pool, true, 0n)).toThrow("positive");
  expect(() => quoteRapidSwap(pool, true, 9223372036854775808n)).toThrow(
    "signed 64-bit",
  );
  const large = {
    ...pool,
    reserveA: 900719925474099300n,
    reserveB: 900719925474099300n,
    feeFrom: 0n,
    swapFees: [0n, 0n],
    treasuryFees: [0n, 0n],
  };
  expect(quoteRapidSwap(large, true, large.reserveA).received).toBe(
    450359962737049650n,
  );
});
it("preserves the marker and share inventory in the continuing output", () => {
  const pool = decodeRapidPool(rapidFixture()),
    { output } = rapidSwapOutput(pool, true, 1000000n);
  expect(output.amount().multiasset()!.get(Core.AssetId(RAPID_MARKER))).toBe(
    1n,
  );
  expect(output.amount().multiasset()!.get(Core.AssetId(pool.lpAsset))).toBe(
    pool.utxo.output().amount().multiasset()!.get(Core.AssetId(pool.lpAsset)),
  );
  expect(output.address().toBytes()).toBe(
    pool.utxo.output().address().toBytes(),
  );
});
