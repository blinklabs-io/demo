// Pure pricing/quoting math ported from dingo-sundae-preview/src/main.ts, so
// WalletSwap can show estimated receive amount and price impact without a
// live quote round-trip.
import { ADA_METADATA, type IPoolData, type IPoolDataAsset } from "@sundaeswap/core";
import type { SwapDirection } from "./swap";

export function poolHasAda(pool: IPoolData): boolean {
  return (
    pool.assetA.assetId === ADA_METADATA.assetId ||
    pool.assetB.assetId === ADA_METADATA.assetId
  );
}

function tokenAssetForPool(pool: IPoolData): IPoolDataAsset | undefined {
  if (pool.assetA.assetId === ADA_METADATA.assetId) {
    return pool.assetB;
  }
  if (pool.assetB.assetId === ADA_METADATA.assetId) {
    return pool.assetA;
  }
  return undefined;
}

export function offeredAssetForDirection(
  pool: IPoolData,
  direction: SwapDirection,
): IPoolDataAsset {
  if (direction === "adaToToken") {
    return ADA_METADATA;
  }
  const token = tokenAssetForPool(pool);
  if (!token) {
    throw new Error("The selected pool is not an ADA pair.");
  }
  return token;
}

export function receivedAssetForDirection(
  pool: IPoolData,
  direction: SwapDirection,
): IPoolDataAsset {
  if (direction === "adaToToken") {
    const token = tokenAssetForPool(pool);
    if (!token) {
      throw new Error("The selected pool is not an ADA pair.");
    }
    return token;
  }
  return ADA_METADATA;
}

function reserveForAsset(pool: IPoolData, asset: IPoolDataAsset): bigint {
  if (pool.assetA.assetId === asset.assetId) {
    return pool.liquidity.aReserve;
  }
  if (pool.assetB.assetId === asset.assetId) {
    return pool.liquidity.bReserve;
  }
  throw new Error(`Asset ${asset.assetId} is not in pool ${pool.ident}.`);
}

function poolFeeBasisPoints(pool: IPoolData): bigint {
  return BigInt(Math.max(0, Math.min(10_000, Math.round(pool.currentFee * 10_000))));
}

function amountAfterPoolFee(pool: IPoolData, amount: bigint): bigint {
  const fee = poolFeeBasisPoints(pool);
  return (amount * (10_000n - fee)) / 10_000n;
}

export function quoteOutput(
  pool: IPoolData,
  offered: IPoolDataAsset,
  received: IPoolDataAsset,
  inputAmount: bigint,
): bigint {
  const reserveIn = reserveForAsset(pool, offered);
  const reserveOut = reserveForAsset(pool, received);
  if (inputAmount <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return 0n;
  }

  const inputAfterFee = amountAfterPoolFee(pool, inputAmount);
  return (inputAfterFee * reserveOut) / (reserveIn + inputAfterFee);
}

export function priceImpactBasisPoints(
  pool: IPoolData,
  offered: IPoolDataAsset,
  received: IPoolDataAsset,
  inputAmount: bigint,
): bigint {
  const reserveIn = reserveForAsset(pool, offered);
  const reserveOut = reserveForAsset(pool, received);
  if (inputAmount <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return 0n;
  }

  const inputAfterFee = amountAfterPoolFee(pool, inputAmount);
  const spotOutputAfterFee = (inputAfterFee * reserveOut) / reserveIn;
  const quotedOutput = quoteOutput(pool, offered, received, inputAmount);
  if (spotOutputAfterFee <= 0n || quotedOutput >= spotOutputAfterFee) {
    return 0n;
  }

  const loss = spotOutputAfterFee - quotedOutput;
  return (loss * 10_000n + spotOutputAfterFee / 2n) / spotOutputAfterFee;
}

export function formatBasisPointsPercent(bps: bigint): string {
  const clamped = bps > 10_000n ? 10_000n : bps;
  const whole = clamped / 100n;
  const fraction = (clamped % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}%`;
}

export function formatRatio(
  numerator: bigint,
  numeratorDecimals: number,
  denominator: bigint,
  denominatorDecimals: number,
  precision = 6,
): string {
  if (denominator === 0n) {
    return "-";
  }

  const scaled =
    (numerator * 10n ** BigInt(denominatorDecimals) * 10n ** BigInt(precision)) /
    (denominator * 10n ** BigInt(numeratorDecimals));
  const divisor = 10n ** BigInt(precision);
  const whole = scaled / divisor;
  const fraction = (scaled % divisor)
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function spotPriceLabel(
  pool: IPoolData,
  offered: IPoolDataAsset,
  received: IPoolDataAsset,
  labelFor: (asset: IPoolDataAsset) => string,
): string {
  return `1 ${labelFor(offered)} = ${formatRatio(
    reserveForAsset(pool, received),
    received.decimals ?? 0,
    reserveForAsset(pool, offered),
    offered.decimals ?? 0,
  )} ${labelFor(received)}`;
}
