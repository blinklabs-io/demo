import { useState } from "react";
import { readPoolLogos } from "../../lib/dingo/poolLogo";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { shortenHash } from "../../lib/format";

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
  const [failed, setFailed] = useState<string[]>([]);
  const logos = useQuery({
    queryKey: ["pool-logo", metadata?.url, metadata?.hash],
    queryFn: ({ signal }) => readPoolLogos(metadata!.url!, signal),
    enabled: Boolean(metadata?.url),
    staleTime: 86_400_000,
    gcTime: 86_400_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const image = logos.data?.find((url) => !failed.includes(url));
  const initials =
    metadata?.ticker?.slice(0, 2) || poolId.slice(-2).toUpperCase();
  return (
    <span className="pool-avatar" aria-hidden="true">
      {image ? (
        <img
          key={image}
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((previous) => [...previous, image])}
        />
      ) : (
        initials
      )}
    </span>
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
      <PoolAvatar
        key={`${poolId}:${info?.url ?? ""}:${info?.hash ?? ""}`}
        metadata={info}
        poolId={poolId}
      />
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
