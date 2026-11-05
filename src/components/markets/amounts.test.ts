// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { expect, it } from "vitest";
import { rawAmount } from "./amounts";
const maximum = 18446744073709551615n,
  unit = "11".repeat(28) + "01";
it("accepts unsigned output quantities above the signed mint range and preserves their CBOR value", () => {
  const amount = rawAmount(maximum.toString(), unit),
    value = new Core.Value(0n, new Map([[Core.AssetId(unit), amount]]));
  expect(
    Core.Value.fromCbor(value.toCbor()).multiasset()?.get(Core.AssetId(unit)),
  ).toBe(maximum);
  expect(rawAmount("9223372036854775808", unit)).toBe(9223372036854775808n);
});
it("rejects amounts above unsigned output range before serialization can truncate them", () => {
  expect(() => rawAmount((maximum + 1n).toString(), unit)).toThrow("64-bit");
  expect(rawAmount("18446744073709.551615", "lovelace")).toBe(maximum);
  expect(() => rawAmount("18446744073709.551616", "lovelace")).toThrow(
    "64-bit",
  );
});
