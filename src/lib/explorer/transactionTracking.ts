import { blockfrostFetch, BlockfrostError } from "../dingo/blockfrost";

export const isTransactionHash = (hash: string) => /^[0-9a-f]{64}$/i.test(hash);

export interface TrackedInclusion {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  valid_contract: boolean;
}
export interface TrackingSnapshot {
  inclusion: TrackedInclusion | null;
  depth: number | null;
  tip: { height: number; slot: number; hash: string };
}

export async function readTrackingSnapshot(
  hash: string,
  signal?: AbortSignal,
): Promise<TrackingSnapshot> {
  if (!isTransactionHash(hash))
    throw new Error("Enter a 64-character transaction ID.");
  const tip = await blockfrostFetch<TrackingSnapshot["tip"]>(
    "/api/v0/blocks/latest",
    { signal },
  );
  if (
    !tip ||
    !Number.isSafeInteger(tip.height) ||
    tip.height < 0 ||
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    !isTransactionHash(tip.hash)
  )
    throw new Error("Dingo returned an invalid chain tip.");
  let inclusion: TrackedInclusion | null;
  try {
    inclusion = await blockfrostFetch<TrackedInclusion>(`/api/v0/txs/${hash}`, {
      signal,
    });
    if (!inclusion)
      throw new Error("Dingo returned invalid inclusion evidence.");
  } catch (error) {
    if (!(error instanceof BlockfrostError && error.status === 404))
      throw error;
    inclusion = null;
  }
  if (
    inclusion &&
    (inclusion.hash !== hash ||
      !isTransactionHash(inclusion.block) ||
      !Number.isSafeInteger(inclusion.block_height) ||
      inclusion.block_height < 0 ||
      !Number.isSafeInteger(inclusion.block_time) ||
      inclusion.block_time < 0 ||
      typeof inclusion.valid_contract !== "boolean")
  )
    throw new Error("Dingo returned invalid inclusion evidence.");
  let depth: number | null = null;
  if (inclusion) {
    const canonical = await blockfrostFetch<{
      height: number;
      hash: string;
      confirmations: number;
    }>(`/api/v0/blocks/${inclusion.block_height}`, { signal });
    if (
      !canonical ||
      canonical.height !== inclusion.block_height ||
      canonical.hash !== inclusion.block
    )
      throw new Error(
        "Transaction inclusion does not match the canonical block. Awaiting refreshed chain evidence.",
      );
    if (
      !Number.isSafeInteger(canonical.confirmations) ||
      canonical.confirmations < 0 ||
      !Number.isSafeInteger(canonical.confirmations + 1)
    )
      throw new Error("Dingo returned invalid canonical confirmation depth.");
    depth = canonical.confirmations + 1;
  }
  return { inclusion, tip, depth };
}

export function trackingVerdict(
  snapshot: Pick<TrackingSnapshot, "tip" | "inclusion"> | undefined,
  pending: boolean,
  validUntil?: number,
) {
  const included = snapshot?.inclusion;
  if (included)
    return included.valid_contract
      ? "Included on chain"
      : "Script validation failed";
  if (snapshot && validUntil !== undefined && snapshot.tip.slot >= validUntil)
    return "Validity window ended";
  if (pending) return "Observed in mempool";
  return "Awaiting chain evidence";
}
