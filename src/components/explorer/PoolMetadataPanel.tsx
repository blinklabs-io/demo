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
  const homepage = website(metadata?.homepage),
    source = website(metadata?.url);
  return (
    <Panel title="Pool metadata">
      <p className="pool-owner-note">
        Provided by the pool owner, not independently endorsed by Dingo or Blink
        Labs.
      </p>
      <QueryState
        hasData={metadata !== undefined}
        isLoading={isLoading}
        error={error}
        notFoundLabel="No owner metadata is registered for this pool."
      >
        {metadata && (
          <>
            <Field label="Name" value={metadata.name ?? "Not provided"} />
            <Field
              label="Ticker"
              value={metadata.ticker ?? "Not provided"}
            />
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
          </>
        )}
      </QueryState>
    </Panel>
  );
}
