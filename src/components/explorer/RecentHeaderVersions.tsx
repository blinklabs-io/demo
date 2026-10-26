import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";
import { readHeaderVersion } from "../../lib/dingo/blockHeader";
import { Distribution } from "./Visuals";

const colors = ["#2dd4bf", "#818cf8", "#fbbf24", "#f472b6", "#60a5fa"];

export function RecentHeaderVersions({
  blocks,
}: {
  blocks: Array<{ hash: string; slot: number; height: number; time: number }>;
}) {
  // The block list owns the reads; this observer only consumes its cache.
  const headers = useQueries({
    queries: blocks.map((block) => ({
      queryKey: ["dingo", "block-header-version", block.hash],
      queryFn: () => readHeaderVersion(block.hash, block.slot),
      enabled: false,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const counts = new Map<string, number>();
  for (const header of headers)
    if (header.data) {
      const version = `${header.data.major}.${header.data.minor}`;
      counts.set(version, (counts.get(version) ?? 0) + 1);
    }
  const versions = [...counts].sort(
    ([a, countA], [b, countB]) => countB - countA || a.localeCompare(b),
  );
  const decoded = headers.filter((header) => header.data).length;
  const failed = headers.filter(
    (header) => header.isError && !header.data,
  ).length;
  const first = blocks.at(-1);
  const last = blocks[0];
  const date = (time: number) =>
    new Date(time * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <div className="recent-header-versions">
      <section className="recent-version-share">
        {decoded ? (
          <Distribution
            title="Decoded headers"
            unit={`${decoded} blocks`}
            items={versions.map(([version, count]) => ({
              label: version.endsWith(".69") ? `${version} · Dingo` : version,
              value: BigInt(count),
              display: `${count} · ${((count / decoded) * 100).toFixed(1)}%`,
            }))}
          />
        ) : (
          <div className="price-chart-empty" role="status">
            Waiting for the block list's headers…
          </div>
        )}
      </section>
      <section className="recent-version-sequence">
        <div className="network-section-heading">
          <span className="eyebrow">Recent block sequence</span>
          <span className="text-xs text-slate-400">Oldest → newest</span>
        </div>
        <div className="recent-version-blocks">
          {blocks
            .map((block, index) => {
              const header = headers[index];
              const version = header.data
                ? `${header.data.major}.${header.data.minor}`
                : undefined;
              const colorIndex = versions.findIndex(
                ([name]) => name === version,
              );
              return (
                <Link
                  key={block.hash}
                  to={`/explorer/block/${block.hash}`}
                  style={{
                    background: version
                      ? colors[colorIndex % colors.length]
                      : "#293b4b",
                  }}
                  aria-label={`Block ${block.height}, header version ${version ?? (header.isError ? "unavailable" : "loading")}`}
                  title={`Block ${block.height} · ${date(block.time)} · ${version ?? (header.isError ? "Header unavailable" : "Loading header")}`}
                />
              );
            })
            .reverse()}
        </div>
        {first && last && (
          <div className="recent-version-range">
            <span>{date(first.time)}</span>
            <span>{date(last.time)}</span>
          </div>
        )}
        <div className="recent-version-legend">
          {versions.map(([version, count], index) => (
            <span key={version}>
              <i style={{ background: colors[index % colors.length] }} />
              <strong>{version}</strong>
              {version.endsWith(".69") && <small>Dingo</small>}
              <span>
                {count} {count === 1 ? "block" : "blocks"}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400" role="status">
          {decoded} of {blocks.length} displayed block headers decoded
          {failed ? ` · ${failed} unavailable` : ""}
          {blocks.length - decoded - failed > 0
            ? ` · ${blocks.length - decoded - failed} loading`
            : ""}
          .
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Uses the same headers as the block list below. Shares cover decoded
          headers in this recent window, not a 24-hour network total.
        </p>
      </section>
    </div>
  );
}
