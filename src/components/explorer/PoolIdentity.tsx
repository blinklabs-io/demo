import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { shortenHash } from "../../lib/format";

export interface PoolMetadata {
  ticker?: string | null;
  name?: string | null;
}

function PoolAvatar({
  metadata,
  poolId,
}: {
  metadata?: PoolMetadata | null;
  poolId: string;
}) {
  const initials =
    metadata?.ticker?.slice(0, 2) || poolId.slice(-2).toUpperCase();
  return (
    <span className="pool-avatar" aria-hidden="true">{initials}</span>
  );
}

export function PoolIdentity({
  poolId,
  metadata,
  compact = false,
}: {
  poolId: string;
  metadata?: PoolMetadata | null;
  compact?: boolean;
}) {
  const query = useQuery({
    queryKey: ["dingo", "pool", poolId, "metadata"],
    queryFn: () =>
      blockfrostFetch<PoolMetadata>(
        `/api/v0/pools/${encodeURIComponent(poolId)}/metadata`,
      ),
    enabled: metadata === undefined,
    staleTime: 3_600_000,
    retry: false,
  });
  const info = metadata === undefined ? query.data : metadata;
  return (
    <Link
      to={`/explorer/pool/${encodeURIComponent(poolId)}`}
      className={`pool-identity ${compact ? "compact" : ""}`}
      title={poolId}
    >
      <PoolAvatar metadata={info} poolId={poolId} />
      <span className="pool-label">
        <strong>
          {info?.ticker ? info.ticker : shortenHash(poolId, 6)}
          {!compact && info?.name && <span> {info.name}</span>}
        </strong>
        {!compact && <small>{shortenHash(poolId, 10)}</small>}
      </span>
    </Link>
  );
}
