import { readMinswapAssetPage, minswapAssetReader, type MinswapAssetReader } from "./rpc";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_NETWORK } from "../dingo/config";
import { minswapDeployment } from "./constants";
import { authenticatePool, type MinswapPool, type MinswapUtxo } from "./data";
import { POPULAR_POOL_LIMIT, type PopularPool } from "./popular";
import { quoteWithdraw } from "./quotes";
export function assertMinswapNetwork() {
  minswapDeployment();
}
export async function assertMinswapGenesis(signal?: AbortSignal) {
  assertMinswapNetwork();
  const genesis = await blockfrostFetch<{ network_magic: number }>(
    "/api/v0/genesis",
    { signal },
  );
  if (genesis.network_magic !== DINGO_NETWORK.networkMagic)
    throw new Error(`Minswap V2 requires verified ${DINGO_NETWORK.label} Dingo data.`);
}
export async function readMinswapPools(page = 1, signal?: AbortSignal, cursor = ""): Promise<{ pools: MinswapPool[]; partial: boolean; errors: string[]; nextToken?: string }> {
  if (!Number.isSafeInteger(page) || page < 1)
    throw new Error("Choose a valid Minswap pool page.");
  await assertMinswapGenesis(signal);
  if (DINGO_NETWORK.id === "mainnet" && page > 1 && !cursor) throw new Error("Load the preceding Minswap pool page first.");
  const rpc = DINGO_NETWORK.id === "mainnet" ? await readMinswapAssetPage(minswapDeployment().poolAuthenAsset, cursor, signal) : null;
  const rows = rpc ? rpc.rows : await blockfrostFetch<MinswapUtxo[]>(
    `/api/v0/addresses/${minswapDeployment().poolCreationAddress}/utxos/${minswapDeployment().poolAuthenAsset}?count=20&page=${page}`,
    { signal },
  );
  const pools: MinswapPool[] = [],
    errors: string[] = [];
  for (const row of rows) {
    try {
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
  return { pools, partial: rpc ? !!rpc.nextToken : rows.length === 20, errors, ...(rpc ? { nextToken: rpc.nextToken } : {}) };
}
async function poolByLp(lpAsset: string, signal?: AbortSignal, reader?: MinswapAssetReader) {
  if (
    !new RegExp(`^${minswapDeployment().lpPolicyId}[0-9a-f]{64}$`).test(lpAsset)
  )
    throw new Error("Invalid Minswap V2 liquidity token.");
  const readPage = DINGO_NETWORK.id === "mainnet" ? reader ?? await minswapAssetReader(signal) : null;
  const candidates: MinswapUtxo[] = [];
  let complete = false;
  const seen = new Set<string>();
  let cursor = "";
  for (let page = 1; page <= 5; page++) {
    signal?.throwIfAborted();
    const rpc = readPage ? await readPage(lpAsset, cursor, minswapDeployment().poolScriptHash) : null;
    const rows = rpc ? rpc.rows : await blockfrostFetch<MinswapUtxo[]>(
      `/api/v0/addresses/${minswapDeployment().poolCreationAddress}/utxos/${lpAsset}?count=20&page=${page}`,
      { signal },
    );
    if (rpc) cursor = rpc.nextToken;
    if (rows.length > 20)
      throw new Error(
        "Dingo exceeded the requested Minswap pool lookup page size.",
      );
    for (const row of rows) {
      const key = row.tx_hash + "#" + row.output_index;
      if (seen.has(key))
        throw new Error("Dingo repeated a Minswap pool lookup output.");
      seen.add(key);
      if (
        row.amount.some(
          (asset) =>
            asset.unit === minswapDeployment().poolAuthenAsset &&
            asset.quantity === "1",
        )
      )
        {
          const pool = authenticatePool(row);
          if (pool.lpAsset === lpAsset) candidates.push(row);
        }
    }
    if (rpc ? !rpc.nextToken : rows.length < 20) {
      complete = true;
      break;
    }
  }
  if (!complete)
    throw new Error(
      "Minswap pool lookup exceeded its bounded 100-output scan. Narrow or refresh the lookup.",
    );
  if (candidates.length !== 1)
    throw new Error(
      "Minswap pool state changed or is unavailable. Refresh the pool list.",
    );
  const pool = authenticatePool(candidates[0]);
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
      new RegExp(`^${minswapDeployment().lpPolicyId}[0-9a-f]{64}$`).test(
        row.assetId,
      ) && row.quantity > 0n,
  );
  if (!held.length) return { positions: [], errors: [], partial: false };
  await assertMinswapGenesis(signal);
  const reader = DINGO_NETWORK.id === "mainnet" ? await minswapAssetReader(signal) : undefined;
  const results = await Promise.allSettled(
    held.slice(0, 20).map(async (row) => {
      const pool = await poolByLp(row.assetId, signal, reader);
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

export async function readPopularMinswapPools(signal?: AbortSignal) {
  if (DINGO_NETWORK.id !== "mainnet") throw new Error("Mainnet market volumes require Mainnet.");
  const response = await fetch("/market-pools", { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Market volumes are unavailable. Retry or browse all pools.");
  const data: { pools: PopularPool[] } = await response.json();
  if (!Array.isArray(data.pools) || data.pools.length > POPULAR_POOL_LIMIT || new Set(data.pools.map((p) => p.lpAsset)).size !== data.pools.length || data.pools.some((p) => typeof p.volumeAda !== "number" || !Number.isFinite(p.volumeAda) || p.volumeAda <= 0))
    throw new Error("Invalid market volume response.");
  return { pools: data.pools.map((pool) => ({ ...pool, id: pool.lpAsset })), errors: [], partial: false, nextToken: "" };
}
export async function readPopularMinswapPool(metric: PopularPool, signal?: AbortSignal) {
  const pool = await readMinswapPool(metric, signal);
  if (pool.assetA !== metric.assetA || pool.assetB !== metric.assetB)
    throw new Error("Market asset pair differs from its authenticated pool.");
  return pool;
}
