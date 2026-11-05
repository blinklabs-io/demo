// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decimalFraction, rawAmount, marketAssetName } from "./amounts";
describe("human market amounts and on-chain units", () => {
  it("preserves exact ADA precision and rejects fractional token base units", () => {
    expect(rawAmount("9007199254740993.000001", "lovelace")).toBe(
      9007199254740993000001n,
    );
    expect(rawAmount("9007199254740993", "native")).toBe(9007199254740993n);
    expect(() => rawAmount("1.01", "native")).toThrow("whole number");
    expect(() => rawAmount("1.0000001", "lovelace")).toThrow("six decimal");
  });
  it("converts ADA prices and collateral ratios to reduced ledger fractions", () => {
    expect(decimalFraction("2.5", 1000000n)).toEqual({
      numerator: 2500000n,
      denominator: 1n,
    });
    expect(decimalFraction("2.5", 1n, 1000000n)).toEqual({
      numerator: 1n,
      denominator: 400000n,
    });
    expect(decimalFraction("0")).toEqual({ numerator: 0n, denominator: 1n });
  });
  it("shows CIP-68 names without the binary label while retaining ordinary names", () => {
    const policy = "ab".repeat(28);
    expect(marketAssetName(policy + "0014df104341544b555445")).toBe("CATKUTE");
    expect(marketAssetName(policy + "686f6d656c616e646572")).toBe("homelander");
    expect(marketAssetName(policy + "ff")).toBeTruthy();
  });
});
