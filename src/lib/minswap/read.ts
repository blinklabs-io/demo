import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_NETWORK } from "../dingo/config";
import { PREPROD_MINSWAP_V2 } from "./constants";
import { authenticatePool, type MinswapPool, type MinswapUtxo } from "./data";
import { quoteWithdraw } from "./quotes";
export function assertMinswapNetwork() {
  if (DINGO_NETWORK.id !== "preprod")
    throw new Error(
      "This Minswap V2 deployment is on Preprod. Switch networks to continue.",
    );
}
export async function assertMinswapGenesis(signal?: AbortSignal) {
  assertMinswapNetwork();
  const genesis = await blockfrostFetch<{ network_magic: number }>(
    "/api/v0/genesis",
    { signal },
  );
  if (genesis.network_magic !== 1)
    throw new Error("Minswap V2 requires verified Preprod Dingo data.");
}
export async function readMinswapPools(page = 1, signal?: AbortSignal) {
  if (!Number.isSafeInteger(page) || page < 1)
    throw new Error("Choose a valid Minswap pool page.");
  await assertMinswapGenesis(signal);
  const rows = await blockfrostFetch<MinswapUtxo[]>(
    `/api/v0/addresses/${PREPROD_MINSWAP_V2.poolCreationAddress}/utxos/${PREPROD_MINSWAP_V2.poolAuthenAsset}?count=20&page=${page}`,
    { signal },
  );
  const pools: MinswapPool[] = [],
    errors: string[] = [];
  for (const row of rows) {
    try {
      if (row.address !== PREPROD_MINSWAP_V2.poolCreationAddress)
        throw new Error("Dingo returned a pool from another address.");
      pools.push(authenticatePool(row));
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Unknown Minswap pool record.",
      );
    }
  }
  if (new Set(pools.map((pool) => pool.id)).size !== pools.length)
    throw new Error(
      "Dingo returned competing live states for one Minswap pool.",
    );
  return { pools, partial: rows.length === 20, errors };
}
async function poolByLp(lpAsset: string, signal?: AbortSignal) {
  if (
    !new RegExp(`^${PREPROD_MINSWAP_V2.lpPolicyId}[0-9a-f]{64}$`).test(lpAsset)
  )
    throw new Error("Invalid Minswap V2 liquidity token.");
  const rows = await blockfrostFetch<MinswapUtxo[]>(
    `/api/v0/addresses/${PREPROD_MINSWAP_V2.poolCreationAddress}/utxos/${lpAsset}?count=2&page=1`,
    { signal },
  );
  if (rows.length !== 1)
    throw new Error(
      "Minswap pool state changed or is unavailable. Refresh the pool list.",
    );
  if (rows[0].address !== PREPROD_MINSWAP_V2.poolCreationAddress)
    throw new Error("Dingo returned a pool from another address.");
  const pool = authenticatePool(rows[0]);
  if (pool.lpAsset !== lpAsset)
    throw new Error("Dingo returned another Minswap pool.");
  return pool;
}
export async function readMinswapPool(
  pool: Pick<MinswapPool, "lpAsset">,
  signal?: AbortSignal,
) {
  await assertMinswapGenesis(signal);
  return poolByLp(pool.lpAsset, signal);
}
export async function readLiquidityPositions(
  balances: { assetId: string; quantity: bigint }[],
  signal?: AbortSignal,
) {
  assertMinswapNetwork();
  const held = balances.filter(
    (row) =>
      new RegExp(`^${PREPROD_MINSWAP_V2.lpPolicyId}[0-9a-f]{64}$`).test(
        row.assetId,
      ) && row.quantity > 0n,
  );
  if (!held.length) return { positions: [], errors: [], partial: false };
  await assertMinswapGenesis(signal);
  const results = await Promise.allSettled(
    held.slice(0, 20).map(async (row) => {
      const pool = await poolByLp(row.assetId, signal);
      return {
        pool,
        lpAmount: row.quantity,
        ...quoteWithdraw(pool, row.quantity, 0),
      };
    }),
  );
  if (signal?.aborted)
    throw signal.reason ?? new Error("Position lookup cancelled.");
  return {
    positions: results.flatMap((row) =>
      row.status === "fulfilled" ? [row.value] : [],
    ),
    errors: results.flatMap((row) =>
      row.status === "rejected"
        ? [
            row.reason instanceof Error
              ? row.reason.message
              : "Unknown position",
          ]
        : [],
    ),
    partial: held.length > 20,
  };
}
export function liquidityPositions(
  pools: MinswapPool[],
  balances: { assetId: string; quantity: bigint }[],
) {
  return pools.flatMap((pool) => {
    const amount = balances
      .filter((row) => row.assetId === pool.lpAsset)
      .reduce((sum, row) => sum + row.quantity, 0n);
    return amount > 0n
      ? [{ pool, lpAmount: amount, ...quoteWithdraw(pool, amount, 0) }]
      : [];
  });
}
