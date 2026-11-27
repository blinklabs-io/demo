import { useMemo } from "react";
import { Link } from "../NetworkLink";
import { nodeImplementation } from "../../lib/dingo/nodeImplementation";
import "./header-history.css";

export interface VersionRecord {
  hash: string;
  height: number;
  time: number;
  major: string;
  minor: string;
}
const implementation = (record: Pick<VersionRecord, "minor" | "major">) =>
  nodeImplementation(record.minor);
const versionOf = (record: VersionRecord) => `${record.major}.${record.minor}`;
const time = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
// One colour per implementation, never per version: the rows are labelled, so
// colour only has to separate a handful of families. Haskell is the baseline
// and stays grey; Dingo, this site's subject, takes the accent.
const FAMILY_COLOR: Record<string, string> = {
  "cardano-node": "var(--gray-8)",
  dingo: "var(--accent)",
  amaru: "var(--viz-4)",
  gerolamo: "var(--viz-2)",
  "cardano-bean": "var(--viz-2)",
  tsunagi: "var(--viz-6)",
  unknown: "var(--viz-5)",
};
const color = (record: Pick<VersionRecord, "minor" | "major">) =>
  FAMILY_COLOR[implementation(record).id] ?? FAMILY_COLOR.unknown;

type Scope =
  | { kind: "all" }
  | { kind: "alternatives" }
  | { kind: "version"; version: string }
  | { kind: "hour"; index: number };
export interface HeaderVersionSelection {
  scope: Scope;
  page: number;
}
export function HeaderVersionChart({
  records,
  startTime,
  endTime,
  complete,
  selection,
  onSelectionChange,
}: {
  records: VersionRecord[];
  startTime: number;
  endTime: number;
  complete: boolean;
  selection: HeaderVersionSelection;
  onSelectionChange: (selection: HeaderVersionSelection) => void;
}) {
  const { scope, page } = selection;
  const windowRecords = useMemo(
    () =>
      records.filter(
        (record) => record.time >= startTime && record.time <= endTime,
      ),
    [records, startTime, endTime],
  );
  const data = useMemo(() => {
    const versions = new Map<
      string,
      { record: VersionRecord; count: number }
    >();
    const hours = Array.from({ length: 24 }, (_, index) => ({
      start: startTime + index * 3600,
      records: [] as VersionRecord[],
      counts: new Map<string, number>(),
    }));
    for (const record of windowRecords) {
      if (record.time < startTime || record.time > endTime) continue;
      const name = versionOf(record),
        previous = versions.get(name);
      versions.set(name, { record, count: (previous?.count ?? 0) + 1 });
      const hour =
        hours[Math.min(23, Math.floor((record.time - startTime) / 3600))];
      hour.records.push(record);
      hour.counts.set(name, (hour.counts.get(name) ?? 0) + 1);
    }
    return {
      versions: [...versions.values()].sort(
        (a, b) =>
          Number(implementation(a.record).id === "cardano-node") -
            Number(implementation(b.record).id === "cardano-node") ||
          b.count - a.count ||
          versionOf(a.record).localeCompare(versionOf(b.record)),
      ),
      hours,
    };
  }, [windowRecords, startTime, endTime]);
  const nodes = data.versions.map(({ record, count }) => ({
    ...implementation(record),
    id: versionOf(record),
    family: implementation(record).id,
    count,
    color: color(record),
  }));
  const families = [
    ...nodes
      .reduce((map, node) => {
        const family = map.get(node.family);
        map.set(node.family, {
          name:
            node.family === "unknown"
              ? "Unidentified"
              : node.name.replace(" (assumed)", ""),
          color: node.color,
          count: (family?.count ?? 0) + node.count,
        });
        return map;
      }, new Map<string, { name: string; color: string; count: number }>())
      .values(),
  ].sort((a, b) => b.count - a.count);
  const percent = (count: number) =>
    ((count / Math.max(1, windowRecords.length)) * 100).toFixed(2);
  const matching = [
    ...(scope.kind === "hour"
      ? data.hours[scope.index].records
      : windowRecords),
  ]
    .filter((record) =>
      scope.kind === "version"
        ? versionOf(record) === scope.version
        : scope.kind === "alternatives"
          ? implementation(record).id !== "cardano-node"
          : true,
    )
    .sort((a, b) => b.height - a.height);
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(matching.length / 12) - 1),
    ),
    rows = matching.slice(currentPage * 12, (currentPage + 1) * 12);
  const peak = Math.max(1, ...data.hours.map((hour) => hour.records.length));
  const choose = (next: Scope) => {
    onSelectionChange({ scope: next, page: 0 });
  };
  const scopeLabel =
    scope.kind === "version"
      ? `Header ${scope.version}`
      : scope.kind === "hour"
        ? `${time(data.hours[scope.index].start)}–${time(data.hours[scope.index].start + 3600)}`
        : scope.kind === "alternatives"
          ? "Node diversity"
          : "All header versions";
  return (
    <div className="header-history-chart">
      <section
        className="header-node-share"
        aria-label="Node percentage comparison"
      >
        <div className="header-node-heading">
          <h3>Node and header version share</h3>
          <p>
            Share of{" "}
            {complete
              ? "all blocks in the 24-hour window"
              : "verified blocks so far"}
            , one row per node and block-header version.
          </p>
        </div>
        <div
          className="header-family-bar"
          role="img"
          aria-label={`Share by node implementation: ${families.map((family) => `${family.name} ${percent(family.count)}%`).join(", ")}`}
        >
          {families.map((family) => (
            <span
              key={family.name}
              style={{ flexGrow: family.count, background: family.color }}
            />
          ))}
        </div>
        <ul className="header-family-key">
          {families.map((family) => (
            <li key={family.name}>
              <i style={{ background: family.color }} />
              {family.name}
              <b>{percent(family.count)}%</b>
            </li>
          ))}
        </ul>
        <div
          className="header-node-legend"
          role="group"
          aria-label="Filter blocks by node implementation and header version"
        >
          <div className="header-node-columns" aria-hidden="true">
            <span>Node</span>
            <span>Header version</span>
            <span>Blocks</span>
            <span>Share of blocks</span>
          </div>
          {nodes.map((node) => (
            <button
              key={node.id}
              title={node.detail}
              type="button"
              aria-pressed={
                scope.kind === "version" && scope.version === node.id
              }
              onClick={() => choose({ kind: "version", version: node.id })}
            >
              <img src={node.icon} width="28" height="28" alt="" />
              <span className="header-node-name">
                <strong>{node.name}</strong>
                {node.payloadSummary && (
                  <span className="header-node-release">{node.payloadSummary}</span>
                )}
              </span>
              <small className="header-node-version">Header {node.id}</small>
              <span className="header-node-count">
                {node.count.toLocaleString()} blocks
              </span>
              <span className="header-node-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${percent(node.count)}%`,
                    background: node.color,
                  }}
                />
              </span>
              <b>{percent(node.count)}%</b>
            </button>
          ))}
        </div>
        <p className="header-history-note">
          Select a row to list that version’s blocks. Haskell includes
          unsignalled blocks attributed by display assumption.
        </p>
      </section>
      <div className="header-hour-heading">
        <div>
          <h3>24 hours of header versions</h3>
        </div>
        <span>
          {complete ? "Complete window" : "Verified blocks so far"} · one bar
          per hour
        </span>
      </div>
      <div
        className="header-hour-chart"
        role="group"
        aria-label="Filter blocks by hour"
      >
        {data.hours.map((hour, index) => {
          const alternatives = data.versions.filter(
            ({ record }) =>
              implementation(record).id !== "cardano-node" &&
              hour.counts.has(versionOf(record)),
          );
          return (
            <button
              type="button"
              key={index}
              aria-pressed={scope.kind === "hour" && scope.index === index}
              aria-label={`${time(hour.start)}–${time(hour.start + 3600)}: ${hour.records.length} verified blocks${alternatives.map(({ record }) => `, ${implementation(record).name} ${versionOf(record)}: ${hour.counts.get(versionOf(record))}`).join("")}`}
              onClick={() => choose({ kind: "hour", index })}
              title={`${time(hour.start)} · ${hour.records.length} blocks`}
            >
              <span
                className="header-hour-stack"
                style={{ height: `${(hour.records.length / peak) * 100}%` }}
              >
                {data.versions.map(({ record }) => {
                  const count = hour.counts.get(versionOf(record)) ?? 0;
                  return count > 0 ? (
                    <i
                      key={versionOf(record)}
                      style={{
                        height: `${(count / Math.max(1, hour.records.length)) * 100}%`,
                        background: color(record),
                      }}
                    />
                  ) : null;
                })}
              </span>
              <span className="header-hour-markers" aria-hidden="true">
                {alternatives.map(({ record }) => (
                  <i
                    key={versionOf(record)}
                    style={{ background: color(record) }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="header-hour-axis">
        <span>{time(startTime)}</span>
        <span>{time(startTime + 12 * 3600)}</span>
        <span>{time(endTime)}</span>
      </div>
      <p className="header-history-note">
        Bar height is the number of blocks in that hour. A dot marks an hour
        with blocks from a non-Haskell node, however few. Select an hour to list
        its blocks.
      </p>
      <section
        className="header-history-records"
        aria-label="Verified header blocks"
      >
        <header>
          <div>
            <span className="eyebrow">{scopeLabel}</span>
            <h3>
              {matching.length.toLocaleString()} verified{" "}
              {matching.length === 1 ? "block" : "blocks"}
            </h3>
          </div>
          <div className="header-history-filters">
            <button
              type="button"
              aria-pressed={scope.kind === "alternatives"}
              onClick={() => choose({ kind: "alternatives" })}
            >
              Node diversity
            </button>
            <button
              type="button"
              aria-pressed={scope.kind === "all"}
              onClick={() => choose({ kind: "all" })}
            >
              All blocks
            </button>
          </div>
        </header>
        {rows.length ? (
          <div className="header-history-blocks">
            {rows.map((record) => {
              const node = implementation(record);
              return (
                <Link
                  key={record.hash}
                  title={node.detail}
                  to={`/explorer/block/${record.hash}`}
                >
                  <img src={node.icon} width="20" height="20" alt="" />
                  <span>
                    <strong>#{record.height.toLocaleString()}</strong>
                    <small>
                      {time(record.time)} · {versionOf(record)}
                    </small>
                  </span>
                  <span>{node.name}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="header-history-empty">
            {scope.kind === "alternatives"
              ? "No alternative or unidentified producer signals in the verified blocks yet."
              : "No verified blocks match this selection."}
          </p>
        )}
        {matching.length > 12 && (
          <nav className="header-history-pages" aria-label="Header block pages">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() =>
                onSelectionChange({ scope, page: currentPage - 1 })
              }
            >
              ← Previous
            </button>
            <span>
              {currentPage + 1} / {Math.ceil(matching.length / 12)}
            </span>
            <button
              type="button"
              disabled={(currentPage + 1) * 12 >= matching.length}
              onClick={() =>
                onSelectionChange({ scope, page: currentPage + 1 })
              }
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <p className="header-history-note">
        Producer signals follow (
        <a
          href="https://github.com/cardano-foundation/CIPs/pull/1276"
          target="_blank"
          rel="noreferrer"
        >
          CIP-203 ↗
        </a>
        ). Identities come from the registry or documented historical signals.
        Payloads without a supported definition remain opaque. IDs 42, 67 and
        79 identify Gerolamo, cardano-bean and TSUNAGI.
        Unsignalled blocks are assumed Haskell; explicit opt-outs, unregistered
        IDs and unsupported schemes stay unidentified. Signals are
        self-reported.
      </p>
    </div>
  );
}
