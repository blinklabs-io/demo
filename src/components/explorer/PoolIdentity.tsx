import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { shortenHash } from "../../lib/format";

export interface PoolMetadata {
  ticker?: string | null;
  name?: string | null;
  url?: string | null;
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".localhost") ||
      url.hostname.startsWith("[")
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

async function metadataDocument(
  url: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok || !response.body)
    throw new Error("Pool artwork unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error("Pool metadata exceeds artwork limit");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const data: unknown = JSON.parse(text);
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid pool metadata");
  return data as Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function PoolAvatar({
  metadata,
  poolId,
}: {
  metadata?: PoolMetadata | null;
  poolId: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = httpsUrl(metadata?.url);
  const { data: icon } = useQuery({
    queryKey: ["pool-artwork", url],
    enabled: Boolean(url),
    staleTime: 3_600_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
      const main = await metadataDocument(url!, timeout);
      const extendedUrl = httpsUrl(main.extDataUrl ?? main.extended);
      if (!extendedUrl) return null;
      const extended = await metadataDocument(extendedUrl, timeout);
      const media = object(object(extended.pool).media_assets);
      return (
        httpsUrl(
          media.icon_png_64x64 ?? object(extended.info).url_png_icon_64x64,
        ) ?? null
      );
    },
  });
  const initials =
    metadata?.ticker?.slice(0, 2) || poolId.slice(-2).toUpperCase();
  return (
    <span className="pool-avatar" aria-hidden="true">
      {icon && failedUrl !== icon ? (
        <img
          src={icon}
          alt=""
          width="40"
          height="40"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(icon)}
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
