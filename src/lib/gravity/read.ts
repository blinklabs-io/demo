import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_NETWORK } from "../dingo/config";
import {
  decodeGravityOracle,
  gravityScriptHash,
  GRAVITY_INDEXER_POLICY,
  GRAVITY_PAGE_SIZE,
  type GravityPool,
  type GravityUtxo,
} from "./data";
function pageNumber(page: number) {
  if (!Number.isSafeInteger(page) || page < 1)
    throw new Error("Choose a valid Gravity page.");
}
async function assertNetwork(signal?: AbortSignal) {
  if (DINGO_NETWORK.id !== "preprod")
    throw new Error(
      "Gravity pools are deployed on Preprod. Switch networks to continue.",
    );
  const genesis = await blockfrostFetch<{ network_magic: number }>(
    "/api/v0/genesis",
    { signal },
  );
  if (genesis.network_magic !== 1)
    throw new Error("Gravity requires verified Preprod Dingo data.");
}
function indexerUnit(unit: string) {
  if (!new RegExp(`^${GRAVITY_INDEXER_POLICY}[a-f0-9]{64}$`).test(unit))
    throw new Error("Invalid Gravity indexer asset.");
}
export async function readGravityAssets(page = 1, signal?: AbortSignal) {
  pageNumber(page);
  await assertNetwork(signal);
  const assets = await blockfrostFetch<{ asset: string; quantity: string }[]>(
    `/api/v0/assets/policy/${GRAVITY_INDEXER_POLICY}?count=${GRAVITY_PAGE_SIZE}&page=${page}`,
    { signal },
  );
  if (assets.length > GRAVITY_PAGE_SIZE)
    throw new Error("Dingo exceeded the Gravity asset page limit.");
  for (const row of assets) {
    indexerUnit(row.asset);
    if (!/^\d+$/.test(row.quantity))
      throw new Error("Invalid Gravity indexer supply.");
  }
  return { assets, partial: assets.length === GRAVITY_PAGE_SIZE };
}
export async function readGravityPools(
  indexerAsset: string,
  page = 1,
  signal?: AbortSignal,
) {
  indexerUnit(indexerAsset);
  pageNumber(page);
  await assertNetwork(signal);
  const addresses = await blockfrostFetch<
    { address: string; quantity: string }[]
  >(
    `/api/v0/assets/${indexerAsset}/addresses?count=${GRAVITY_PAGE_SIZE}&page=${page}`,
    { signal },
  );
  if (addresses.length > GRAVITY_PAGE_SIZE)
    throw new Error("Dingo exceeded the Gravity address page limit.");
  const pools: GravityPool[] = [],
    errors: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, addresses.length) }, async () => {
      while (next < addresses.length) {
        const row = addresses[next++];
        try {
          if (row.quantity !== "1")
            throw new Error("Gravity indexer holding is not one token.");
          const hash = gravityScriptHash(row.address);
          const utxos = await blockfrostFetch<GravityUtxo[]>(
            `/api/v0/addresses/${row.address}/utxos/${hash}0001?count=2&page=1`,
            { signal },
          );
          if (utxos.length !== 1 || utxos[0].address !== row.address)
            throw new Error("Gravity pool oracle is missing or ambiguous.");
          const pool = decodeGravityOracle(utxos[0]);
          const identities = [pool.assetA, pool.assetB].map(
            (asset) =>
              GRAVITY_INDEXER_POLICY +
              Core.blake2b_256(Core.HexBlob(asset === "lovelace" ? "" : asset)),
          );
          if (
            !identities.includes(indexerAsset) ||
            utxos[0].amount.filter(
              (a) => a.unit === indexerAsset && a.quantity === "1",
            ).length !== 1
          )
            throw new Error(
              "Gravity oracle does not match the selected indexer asset.",
            );
          pools.push(pool);
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : "Could not read Gravity pool.",
          );
        }
      }
    }),
  );
  if (signal?.aborted)
    throw signal.reason ?? new Error("Gravity discovery cancelled.");
  if (new Set(pools.map((p) => p.id)).size !== pools.length)
    throw new Error("Dingo returned duplicate Gravity pools.");
  pools.sort((a, b) => a.id.localeCompare(b.id));
  return { pools, errors, partial: addresses.length === GRAVITY_PAGE_SIZE };
}
export async function readGravityPoolComposition(
  pool: GravityPool,
  page = 1,
  signal?: AbortSignal,
) {
  pageNumber(page);
  await assertNetwork(signal);
  if (gravityScriptHash(pool.address) !== pool.id)
    throw new Error("Gravity pool address changed.");
  const rows = await blockfrostFetch<GravityUtxo[]>(
    `/api/v0/addresses/${pool.poolAddress}/utxos?count=100&page=${page}`,
    { signal },
  );
  if (rows.length > 100)
    throw new Error("Dingo exceeded the Gravity UTxO page limit.");
  const amounts = new Map<string, bigint>();
  const outpoints = new Set<string>();
  for (const row of rows) {
    const outpoint = `${row.tx_hash}#${row.output_index}`;
    if (
      !/^[a-f0-9]{64}$/.test(row.tx_hash) ||
      !Number.isSafeInteger(row.output_index) ||
      row.output_index < 0 ||
      outpoints.has(outpoint)
    )
      throw new Error("Invalid or duplicate Gravity output reference.");
    outpoints.add(outpoint);
    if (row.address !== pool.poolAddress)
      throw new Error("Dingo returned another Gravity address.");
    const seen = new Set<string>();
    for (const amount of row.amount) {
      if (
        seen.has(amount.unit) ||
        !/^\d+$/.test(amount.quantity) ||
        (amount.unit !== "lovelace" &&
          !/^[a-f0-9]{56}(?:[a-f0-9]{2}){0,32}$/.test(amount.unit))
      )
        throw new Error("Invalid Gravity UTxO value.");
      seen.add(amount.unit);
      amounts.set(
        amount.unit,
        (amounts.get(amount.unit) ?? 0n) + BigInt(amount.quantity),
      );
    }
  }
  return {
    outputs: rows,
    utxoCount: rows.length,
    amounts: [...amounts].map(([asset, quantity]) => ({ asset, quantity })),
    partial: rows.length === 100,
  };
}
