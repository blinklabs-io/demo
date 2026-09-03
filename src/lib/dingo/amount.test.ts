import { describe, expect, it } from "vitest";
import { parseAdaToLovelace, parseAssetAmount } from "./amount";

describe("parseAssetAmount", () => {
  it("parses a whole-number amount for a zero-decimal asset", () => {
    expect(parseAssetAmount("42", 0)).toBe(42n);
  });

  it("rejects a fractional amount for a zero-decimal asset", () => {
    expect(() => parseAssetAmount("4.2", 0)).toThrow(
      "Enter a whole-number asset amount.",
    );
  });

  it("parses a fractional amount within the allowed decimal places", () => {
    expect(parseAssetAmount("1.5", 6)).toBe(1_500_000n);
  });

  it("parses an amount using the maximum allowed decimal places", () => {
    expect(parseAssetAmount("1.123456", 6)).toBe(1_123_456n);
  });

  it("rejects an amount with too many decimal places", () => {
    expect(() => parseAssetAmount("1.1234567", 6, "ADA")).toThrow(
      "Enter a ADA amount with up to 6 decimal places.",
    );
  });

  it("rejects a negative amount", () => {
    expect(() => parseAssetAmount("-1", 6)).toThrow();
  });

  it("rejects a non-numeric amount", () => {
    expect(() => parseAssetAmount("abc", 6)).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => parseAssetAmount("", 6)).toThrow();
  });

  it("trims surrounding whitespace", () => {
    expect(parseAssetAmount("  2.5  ", 6)).toBe(2_500_000n);
  });

  it("rejects a negative decimal count", () => {
    expect(() => parseAssetAmount("1", -1)).toThrow();
  });
});

describe("parseAdaToLovelace", () => {
  it("converts whole ADA to lovelace", () => {
    expect(parseAdaToLovelace("5")).toBe(5_000_000n);
  });

  it("converts fractional ADA to lovelace", () => {
    expect(parseAdaToLovelace("1.5")).toBe(1_500_000n);
  });

  it("rejects more than 6 decimal places", () => {
    expect(() => parseAdaToLovelace("1.1234567")).toThrow();
  });
});
