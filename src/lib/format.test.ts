import { describe, expect, it } from "vitest";
import { formatAda, shortenHash } from "./format";

describe("formatAda", () => {
  it("formats a whole-ADA lovelace amount", () => {
    expect(formatAda(5_000_000n)).toBe("5.00 ADA");
  });

  it("formats a fractional lovelace amount", () => {
    expect(formatAda(1_500_000n)).toBe("1.50 ADA");
  });

  it("formats zero", () => {
    expect(formatAda(0n)).toBe("0.00 ADA");
  });

  it("accepts a plain number", () => {
    expect(formatAda(2_000_000)).toBe("2.00 ADA");
  });

  it("formats a large amount with thousands separators", () => {
    expect(formatAda(1_234_000_000n)).toBe("1,234.00 ADA");
  });
});

describe("shortenHash", () => {
  it("leaves short strings untouched", () => {
    expect(shortenHash("addr1short")).toBe("addr1short");
  });

  it("truncates a long hash to the visible prefix/suffix", () => {
    const hash = "a".repeat(64);
    expect(shortenHash(hash)).toBe(`${"a".repeat(8)}...${"a".repeat(8)}`);
  });

  it("respects a custom visible length", () => {
    const hash = "0123456789abcdef0123456789abcdef";
    expect(shortenHash(hash, 4)).toBe("0123...cdef");
  });
});
