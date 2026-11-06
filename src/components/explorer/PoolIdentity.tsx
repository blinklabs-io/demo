import { useQuery } from "@tanstack/react-query";
import { Link } from "../NetworkLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { CopyButton } from "./CopyButton";

export interface PoolMetadata {
  url?: string | null;
  hash?: string | null;
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
  copyable = true,
}: {
  poolId: string;
  metadata?: PoolMetadata | null;
  compact?: boolean;
  copyable?: boolean;
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
  const identity = (
    <Link
      to={`/explorer/pool/${encodeURIComponent(poolId)}`}
      className={`pool-identity ${compact ? "compact" : ""}`}
      title={poolId}
    >
      <PoolAvatar
        key={`${poolId}:${info?.url ?? ""}:${info?.hash ?? ""}`}
        metadata={info}
        poolId={poolId}
      />
      <span className="pool-label">
        <strong>
          {info?.ticker ? info.ticker : compact ? poolId : "Stake pool"}
          {!compact && info?.name && <span> {info.name}</span>}
        </strong>
        {!compact && <small>{poolId}</small>}
      </span>
    </Link>
  );
  return copyable ? (
    <span className="pool-identity-with-copy">
      {identity}
      <CopyButton value={poolId} label="pool ID" />
    </span>
  ) : (
    identity
  );
}
