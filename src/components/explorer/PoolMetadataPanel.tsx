import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  readExtendedPoolProfile,
  readPoolProfile,
} from "../../lib/dingo/poolLogo";
import { Panel, Field } from "./Panel";
import { QueryState } from "./QueryState";

export interface PoolOwnerMetadata {
  ticker?: string | null;
  name?: string | null;
  description?: string | null;
  homepage?: string | null;
  url?: string | null;
  hash?: string | null;
}
function website(value?: string | null, base?: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function PoolMetadataPanel({
  metadata,
  isLoading,
  error,
}: {
  metadata?: PoolOwnerMetadata;
  isLoading: boolean;
  error: unknown;
}) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const profile = useQuery({
    queryKey: ["pool-profile-verified-v3", metadata?.url, metadata?.hash],
    queryFn: ({ signal }) =>
      readPoolProfile(metadata!.url!, metadata!.hash!, signal),
    enabled: Boolean(metadata?.url && metadata.hash),
    staleTime: 86400000,
    gcTime: 86400000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const additional = useQuery({
    queryKey: [
      "pool-owner-extended",
      profile.data?.extendedUrl,
      metadata?.hash,
    ],
    queryFn: ({ signal }) =>
      readExtendedPoolProfile(profile.data!.extendedUrl!, signal),
    enabled: Boolean(profile.data?.extendedUrl && !profile.data.extended),
    staleTime: 86400000,
    gcTime: 86400000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const presentation = profile.data?.extended
    ? profile.data
    : (additional.data ?? profile.data);
  const homepage = website(metadata?.homepage),
    source = website(metadata?.url);
  const extended = presentation?.extended;
  const logo = [
    ...(profile.data?.logos ?? []),
    ...(additional.data?.logos ?? []),
  ].find((url) => !failedLogos.includes(url));
  return (
    <Panel title="Pool metadata">
      {logo && (
        <div className="pool-profile-heading">
          <img
            src={logo}
            alt={`${metadata?.name ?? "Pool"} logo`}
            width="84"
            height="84"
            referrerPolicy="no-referrer"
            onError={() => setFailedLogos((previous) => [...previous, logo])}
          />
          <div>
            <strong>{metadata?.name ?? "Pool profile"}</strong>
            <span>{metadata?.ticker}</span>
          </div>
        </div>
      )}
      <p className="pool-owner-note">
        Provided by the pool owner, not independently endorsed by Dingo or Blink
        Labs.
        {profile.data && (
          <span className="pool-owner-verification">
            Registered metadata hash verified. Extended content follows the
            owner’s reference.
          </span>
        )}
      </p>
      <QueryState
        hasData={metadata !== undefined}
        isLoading={isLoading}
        error={error}
        notFoundLabel="No owner metadata is registered for this pool."
      >
        {metadata && (
          <>
            {!logo && (
              <>
                <Field label="Name" value={metadata.name ?? "Not provided"} />
                <Field
                  label="Ticker"
                  value={metadata.ticker ?? "Not provided"}
                />
              </>
            )}
            {metadata.description &&
              (!homepage || website(metadata.description) !== homepage) && (
                <Field label="Description" value={metadata.description} />
              )}
            {homepage && (
              <Field
                label="Website"
                value={
                  <a href={homepage} target="_blank" rel="noreferrer">
                    {homepage} ↗
                  </a>
                }
              />
            )}
            {source && (
              <Field
                label="Owner metadata source"
                value={
                  <a href={source} target="_blank" rel="noreferrer">
                    {source} ↗
                  </a>
                }
              />
            )}
            {metadata.hash && (
              <Field label="Registered metadata hash" value={metadata.hash} />
            )}
            {presentation?.links.length ? (
              <nav
                className="pool-socials"
                aria-label="Pool owner social links"
              >
                {presentation.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </nav>
            ) : null}
            {presentation?.fields
              .filter(
                ([label, value]) =>
                  label !== "About" || !homepage || website(value) !== homepage,
              )
              .map(([label, value]) => (
                <Field key={label} label={label} value={value} />
              ))}
            {presentation?.extendedUrl && (
              <Field
                label="Extended metadata source"
                value={presentation.extendedUrl}
              />
            )}
            {extended && (
              <details className="pool-owner-document">
                <summary>View raw owner metadata</summary>
                <pre>{JSON.stringify(extended, null, 2)}</pre>
              </details>
            )}
            {additional.error && (
              <p className="pool-relay-note">
                Extended owner document unavailable: {additional.error.message}
              </p>
            )}
            {profile.error && (
              <p className="pool-relay-note">
                Owner-hosted document unavailable: {profile.error.message}
              </p>
            )}
          </>
        )}
      </QueryState>
    </Panel>
  );
}
