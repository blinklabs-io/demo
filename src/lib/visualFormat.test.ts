import { describe, expect, it } from "vitest";
import { compactAda, epochProgress } from "./visualFormat";

describe("compact ADA", () => {
  it("preserves fractional ADA and nonzero lovelace", () => {
    expect(compactAda(800000n)).toBe("0.80 ₳");
    expect(compactAda("3500000")).toBe("3.50 ₳");
    expect(compactAda(1n)).toBe("0.000001 ₳");
    expect(compactAda(-800000n)).toBe("-0.80 ₳");
  });
  it("retains compact units for larger balances", () => {
    expect(compactAda(1234560000n)).toBe("1.23K ₳");
    expect(compactAda(1234560000000n)).toBe("1.23M ₳");
    expect(compactAda(1234560000000000n)).toBe("1.23B ₳");
  });
});
describe("epoch progress", () => {
  it("bounds progress for out-of-range slots", () => {
    expect(epochProgress(50, 100)).toBe(50);
    expect(epochProgress(-1, 100)).toBe(0);
    expect(epochProgress(101, 100)).toBe(100);
  });
  it("rejects missing, nonfinite and nonpositive timing values", () => {
    for (const [slot, length] of [
      [1, 0],
      [1, -1],
      [undefined, 100],
      [1, undefined],
      [NaN, 100],
      [1, Infinity],
    ])
      expect(epochProgress(slot, length)).toBeNull();
  });
});
