import { describe, expect, it } from "vitest";
import { ADA_METADATA, EContractVersion, type IPoolData } from "@sundaeswap/core";
import {
  formatBasisPointsPercent,
  offeredAssetForDirection,
  poolHasAda,
  priceImpactBasisPoints,
  quoteOutput,
  receivedAssetForDirection,
  spotPriceLabel,
} from "./pricing";

const TOKEN = { assetId: "abcdef0123456789.544f4b454e", decimals: 0 };

function makePool(overrides: Partial<IPoolData> = {}): IPoolData {
  return {
    ident: "test-pool",
    currentFee: 0,
    assetA: ADA_METADATA,
    assetB: TOKEN,
    assetLP: { assetId: "lp-token" },
    liquidity: { aReserve: 100n, bReserve: 1000n, lpTotal: 1n },
    version: EContractVersion.V3,
    ...overrides,
  };
}

const NON_ADA_POOL = makePool({
  assetA: TOKEN,
  assetB: { assetId: "other-token", decimals: 0 },
});

describe("poolHasAda", () => {
  it("is true for a pool with ADA on either side", () => {
    expect(poolHasAda(makePool())).toBe(true);
  });

  it("is false for a pool with no ADA side", () => {
    expect(poolHasAda(NON_ADA_POOL)).toBe(false);
  });
});

describe("offeredAssetForDirection / receivedAssetForDirection", () => {
  it("offers ADA and receives the token when going adaToToken", () => {
    const pool = makePool();
    expect(offeredAssetForDirection(pool, "adaToToken")).toBe(ADA_METADATA);
    expect(receivedAssetForDirection(pool, "adaToToken")).toBe(TOKEN);
  });

  it("offers the token and receives ADA when going tokenToAda", () => {
    const pool = makePool();
    expect(offeredAssetForDirection(pool, "tokenToAda")).toBe(TOKEN);
    expect(receivedAssetForDirection(pool, "tokenToAda")).toBe(ADA_METADATA);
  });

  it("throws for a pool that isn't an ADA pair", () => {
    expect(() => offeredAssetForDirection(NON_ADA_POOL, "tokenToAda")).toThrow(
      "The selected pool is not an ADA pair.",
    );
    expect(() =>
      receivedAssetForDirection(NON_ADA_POOL, "adaToToken"),
    ).toThrow("The selected pool is not an ADA pair.");
  });
});

describe("quoteOutput", () => {
  it("applies the constant-product formula with zero fee", () => {
    // reserveIn=100, reserveOut=1000, input=100, no fee:
    // output = 100 * 1000 / (100 + 100) = 500
    const pool = makePool({ currentFee: 0 });
    expect(quoteOutput(pool, ADA_METADATA, TOKEN, 100n)).toBe(500n);
  });

  it("reduces the output when a pool fee applies", () => {
    const zeroFeePool = makePool({ currentFee: 0 });
    const feePool = makePool({ currentFee: 0.01 });
    const withoutFee = quoteOutput(zeroFeePool, ADA_METADATA, TOKEN, 100n);
    const withFee = quoteOutput(feePool, ADA_METADATA, TOKEN, 100n);
    expect(withFee).toBeLessThan(withoutFee);
  });

  it("returns zero for a non-positive input amount", () => {
    const pool = makePool();
    expect(quoteOutput(pool, ADA_METADATA, TOKEN, 0n)).toBe(0n);
    expect(quoteOutput(pool, ADA_METADATA, TOKEN, -5n)).toBe(0n);
  });

  it("returns zero when a reserve is empty", () => {
    const pool = makePool({ liquidity: { aReserve: 0n, bReserve: 1000n, lpTotal: 1n } });
    expect(quoteOutput(pool, ADA_METADATA, TOKEN, 100n)).toBe(0n);
  });
});

describe("priceImpactBasisPoints", () => {
  it("computes impact as basis points lost versus the spot price", () => {
    // spot output = 100 * 1000 / 100 = 1000; quoted output = 500 (from above).
    // loss = 500; impact = (500 * 10000 + 500) / 1000 = 5000 bps = 50%.
    const pool = makePool({ currentFee: 0 });
    expect(priceImpactBasisPoints(pool, ADA_METADATA, TOKEN, 100n)).toBe(5000n);
  });

  it("is zero for a non-positive input amount", () => {
    const pool = makePool();
    expect(priceImpactBasisPoints(pool, ADA_METADATA, TOKEN, 0n)).toBe(0n);
  });
});

describe("formatBasisPointsPercent", () => {
  it("formats whole and fractional percentages", () => {
    expect(formatBasisPointsPercent(0n)).toBe("0.00%");
    expect(formatBasisPointsPercent(5000n)).toBe("50.00%");
    expect(formatBasisPointsPercent(10_000n)).toBe("100.00%");
    expect(formatBasisPointsPercent(1n)).toBe("0.01%");
  });

  it("clamps anything above 100%", () => {
    expect(formatBasisPointsPercent(15_000n)).toBe("100.00%");
  });
});

describe("spotPriceLabel", () => {
  it("labels the spot price adjusted for each asset's decimals", () => {
    // reserveOut(token)=1000 (0 decimals), reserveIn(ADA)=100 (6 decimals):
    // 1 ADA (1e6 lovelace) buys 1000/100 * 1e6 = 10,000,000 token units.
    const pool = makePool({ currentFee: 0 });
    const label = spotPriceLabel(pool, ADA_METADATA, TOKEN, (asset) =>
      asset.assetId === ADA_METADATA.assetId ? "ADA" : "TOKEN",
    );
    expect(label).toBe("1 ADA = 10000000 TOKEN");
  });
});
