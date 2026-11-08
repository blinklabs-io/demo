import { MAINNET_MINSWAP_V2 } from "./mainnet";

export type PopularPool = { lpAsset: string; assetA: string; assetB: string; volumeAda: number };
export const POPULAR_POOL_LIMIT = 12;

function asset(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Invalid market asset.");
  const { currency_symbol: policy, token_name: name } = value as Record<string, unknown>;
  if (policy === "" && name === "") return "lovelace";
  if (typeof policy !== "string" || !/^[0-9a-f]{56}$/.test(policy) || typeof name !== "string" || !/^(?:[0-9a-f]{2}){0,32}$/.test(name))
    throw new Error("Invalid market asset.");
  return policy + name;
}

export function parsePopularPools(value: unknown): PopularPool[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).pool_metrics))
    throw new Error("Invalid market volume response.");
  const metrics = (value as { pool_metrics: unknown[] }).pool_metrics;
  if (metrics.length > POPULAR_POOL_LIMIT) throw new Error("Oversized market volume response.");
  const rows: PopularPool[] = [];
  const seen = new Set<string>();
  for (const value of metrics) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    try {
      const a = row.asset_a as Record<string, unknown>, b = row.asset_b as Record<string, unknown>;
      const lpAsset = asset(row.lp_asset), assetA = asset(a), assetB = asset(b);
      if (row.type !== "MinswapV2" || a.is_verified !== true || b.is_verified !== true ||
        !new RegExp(`^${MAINNET_MINSWAP_V2.lpPolicyId}[0-9a-f]{64}$`).test(lpAsset) ||
        assetA === assetB || typeof row.volume_24h !== "number" || !Number.isFinite(row.volume_24h) || row.volume_24h <= 0 || seen.has(lpAsset)) continue;
      seen.add(lpAsset);
      rows.push({ lpAsset, assetA, assetB, volumeAda: row.volume_24h });
    } catch { /* An unsupported metric must not hide other active markets. */ }
  }
  return rows.sort((a, b) => b.volumeAda - a.volumeAda || a.lpAsset.localeCompare(b.lpAsset));
}
