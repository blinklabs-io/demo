import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [offset, setOffset] = useState(0);
  const [image, setImage] = useState<{
    src: string;
    next: number | null;
  } | null>(null);
  const initials =
    metadata?.ticker?.slice(0, 2) || poolId.slice(-2).toUpperCase();
  const source =
    metadata?.url && metadata.hash && /^[a-f\d]{64}$/i.test(metadata.hash)
      ? `/pool-image?${new URLSearchParams({ url: metadata.url, hash: metadata.hash, offset: String(offset) })}`
      : null;
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(source, {
          signal: controller.signal,
          referrerPolicy: "no-referrer",
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          return;
        // Complete the cacheable read before the image decoder uses this URL.
        // Keep SVGs on the endpoint so their sandbox headers also apply to navigation.
        await response.arrayBuffer();
        const header = response.headers.get("X-Pool-Image-Next");
        const next = header === null ? NaN : Number(header);
        if (!controller.signal.aborted)
          setImage({
            src: source,
            next:
              Number.isInteger(next) && next > offset && next < 10
                ? next
                : null,
          });
      } catch {
        // An unavailable image leaves this pool's initials visible.
      }
    })();
    return () => controller.abort();
  }, [source, offset]);
  return (
    <span className="pool-avatar" aria-hidden="true">
      {image ? (
        <img
          src={image.src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            setImage(null);
            if (image.next !== null) setOffset(image.next);
          }}
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
