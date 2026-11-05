import { MAX_LIQUIDITY, BURNED_LIQUIDITY } from "./constants";
// Integer quote formulas follow @minswap/sdk; its MIT license is included here.
import type { PoolDatum } from "./data";
export function minimumReceived(value: bigint, slippageBps: number): bigint {
  if (
    !Number.isSafeInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000
  )
    throw new Error("Slippage must be between 0 and 9999 basis points.");
  return (value * BigInt(10000 - slippageBps)) / 10000n;
}
function liquid(pool: PoolDatum) {
  if (pool.reserveA <= 0n || pool.reserveB <= 0n || pool.totalLiquidity <= 0n)
    throw new Error("This Minswap pool has no usable liquidity.");
}
function positive(value: bigint) {
  if (value <= 0n) throw new Error("Enter a positive raw asset amount.");
}
function sqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Invalid Minswap deposit calculation.");
  if (value < 2n) return value;
  let x = value,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}
export function quoteSwap(
  pool: PoolDatum,
  direction: "a-to-b" | "b-to-a",
  amount: bigint,
  slippageBps = 50,
) {
  liquid(pool);
  positive(amount);
  if (direction !== "a-to-b" && direction !== "b-to-a")
    throw new Error("Choose a valid Minswap trade direction.");
  const [reserveIn, reserveOut, fee] =
    direction === "a-to-b"
      ? [pool.reserveA, pool.reserveB, pool.feeA]
      : [pool.reserveB, pool.reserveA, pool.feeB];
  const withFee = amount * (10000n - fee);
  const expected = (withFee * reserveOut) / (10000n * reserveIn + withFee);
  const spotOutput = (amount * reserveOut) / reserveIn;
  return {
    expected,
    minimum: minimumReceived(expected, slippageBps),
    priceImpactBps: spotOutput
      ? Number(((spotOutput - expected) * 10000n) / spotOutput)
      : 0,
  };
}
function depositAfterSwap(
  amountIn: bigint,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  fee: bigint,
  total: bigint,
) {
  const x = (amountOut + reserveOut) * reserveIn;
  const y =
    4n *
    (amountOut + reserveOut) *
    (amountOut * reserveIn * reserveIn - amountIn * reserveIn * reserveOut);
  const z = 2n * (amountOut + reserveOut);
  const numerator =
    sqrt(
      x * x * (20000n - fee) * (20000n - fee) - y * 10000n * (10000n - fee),
    ) -
    (20000n - fee) * x;
  const denominator = z * (10000n - fee);
  return (
    ((amountIn * denominator - numerator) * total) /
    (reserveIn * denominator + numerator)
  );
}
export function quoteDeposit(
  pool: PoolDatum,
  amountA: bigint,
  amountB: bigint,
  slippageBps = 50,
) {
  liquid(pool);
  if (amountA < 0n || amountB < 0n)
    throw new Error("Deposit amounts cannot be negative.");
  positive(amountA + amountB);
  const ratioA = (amountA * pool.totalLiquidity) / pool.reserveA,
    ratioB = (amountB * pool.totalLiquidity) / pool.reserveB;
  const expected =
    ratioA > ratioB
      ? depositAfterSwap(
          amountA,
          amountB,
          pool.reserveA,
          pool.reserveB,
          pool.feeA,
          pool.totalLiquidity,
        )
      : ratioA < ratioB
        ? depositAfterSwap(
            amountB,
            amountA,
            pool.reserveB,
            pool.reserveA,
            pool.feeB,
            pool.totalLiquidity,
          )
        : ratioA;
  if (expected > MAX_LIQUIDITY + BURNED_LIQUIDITY - pool.totalLiquidity)
    throw new Error("Deposit exceeds the pool’s remaining LP token supply.");
  return {
    expected,
    minimum: minimumReceived(expected, slippageBps),
    imbalanced: amountA * pool.reserveB !== amountB * pool.reserveA,
  };
}
export function quoteWithdraw(
  pool: PoolDatum,
  lpAmount: bigint,
  slippageBps = 50,
) {
  liquid(pool);
  positive(lpAmount);
  if (lpAmount > pool.totalLiquidity - BURNED_LIQUIDITY)
    throw new Error("LP amount exceeds the pool liquidity supply.");
  const amountA = (lpAmount * pool.reserveA) / pool.totalLiquidity,
    amountB = (lpAmount * pool.reserveB) / pool.totalLiquidity;
  return {
    amountA,
    amountB,
    minimumA: minimumReceived(amountA, slippageBps),
    minimumB: minimumReceived(amountB, slippageBps),
    shareBps: Number((lpAmount * 10000n) / pool.totalLiquidity),
  };
}
