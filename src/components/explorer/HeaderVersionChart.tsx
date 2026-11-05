import { useId, useMemo, useState } from "react";
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
  nodeImplementation(record.minor, record.major);
const versionOf = (record: VersionRecord) => `${record.major}.${record.minor}`;
const time = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
function color(record: Pick<VersionRecord, "minor" | "major">) {
  switch (implementation(record).id) {
    case "dingo":
      return "#35ddba";
    case "amaru":
      return "#b49aff";
    case "bean":
      return "#ffc867";
    default:
      return record.minor === "1"
        ? "#7299bf"
        : record.minor === "2"
          ? "#87b9cb"
          : "#4f7898";
  }
}
type Scope =
  | { kind: "all" }
  | { kind: "alternatives" }
  | { kind: "version"; version: string }
  | { kind: "hour"; index: number };
export function HeaderVersionChart({
  records,
  startTime,
  endTime,
  complete,
}: {
  records: VersionRecord[];
  startTime: number;
  endTime: number;
  complete: boolean;
}) {
  const pieId = useId();
  const [scope, setScope] = useState<Scope>({ kind: "alternatives" });
  const [page, setPage] = useState(0);
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
    count,
    color: color(record),
  }));
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
    setScope(next);
    setPage(0);
  };
  const scopeLabel =
    scope.kind === "version"
      ? `Header ${scope.version}`
      : scope.kind === "hour"
        ? `${time(data.hours[scope.index].start)}–${time(data.hours[scope.index].start + 3600)}`
        : scope.kind === "alternatives"
          ? "Alternative node markers"
          : "All header versions";
  return (
    <div className="header-history-chart">
      <section
        className="header-node-share"
        aria-label="Node percentage comparison"
      >
        <div className="header-node-pie-heading">
          <span className="eyebrow">
            Node / header share ·{" "}
            {complete ? "complete 24 hours" : "verified blocks so far"}
          </span>
          <h3>Who built the blocks?</h3>
          <p>Each node and block-header version has its own slice.</p>
        </div>
        <div className="header-node-pie-layout">
          <svg
            viewBox="0 0 280 280"
            role="group"
            aria-labelledby={pieId}
            className="header-node-pie"
          >
            <title id={pieId}>
              Percentage of{" "}
              {complete
                ? "all blocks in the 24-hour window"
                : "verified blocks so far"}{" "}
              by node implementation and header version
            </title>
            {nodes.map((node, index) => {
              const total = windowRecords.length,
                share = node.count / total,
                start =
                  (nodes.slice(0, index).reduce((sum, n) => sum + n.count, 0) /
                    total) *
                    Math.PI *
                    2 -
                  Math.PI / 2,
                end = start + share * Math.PI * 2;
              const point = (angle: number) =>
                `${140 + 115 * Math.cos(angle)} ${140 + 115 * Math.sin(angle)}`;
              const path =
                share === 1
                  ? "M140 25 A115 115 0 1 1 140 255 A115 115 0 1 1 140 25 Z"
                  : `M140 140 L${point(start)} A115 115 0 ${share > 0.5 ? 1 : 0} 1 ${point(end)} Z`;
              const selected =
                scope.kind === "version" && scope.version === node.id;
              return (
                <path
                  key={node.id}
                  d={path}
                  fill={node.color}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name} ${node.id}: ${(share * 100).toFixed(2)}%, ${node.count} blocks`}
                  aria-pressed={selected}
                  onClick={() => choose({ kind: "version", version: node.id })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      choose({ kind: "version", version: node.id });
                    }
                  }}
                >
                  <title>
                    {node.name} {node.id}: {(share * 100).toFixed(2)}% ·{" "}
                    {node.count.toLocaleString()} blocks
                  </title>
                </path>
              );
            })}
          </svg>
          <div
            className="header-node-legend"
            role="group"
            aria-label="Filter blocks by node implementation and header version"
          >
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                aria-pressed={
                  scope.kind === "version" && scope.version === node.id
                }
                onClick={() => choose({ kind: "version", version: node.id })}
                style={{ "--version-color": node.color } as React.CSSProperties}
              >
                <img src={node.icon} width="30" height="30" alt="" />
                <span>
                  <strong>{node.name}</strong>
                  <small>
                    Header {node.id} · {node.count.toLocaleString()} blocks
                  </small>
                </span>
                <b>{((node.count / windowRecords.length) * 100).toFixed(2)}%</b>
              </button>
            ))}
          </div>
        </div>
        <p className="header-history-note">
          Select a slice or legend entry to inspect that version’s blocks.
          Haskell includes unrecognized versions assumed to be Haskell.
        </p>
      </section>
      <div className="header-hour-heading">
        <div>
          <span className="eyebrow">Every block counts</span>
          <h3>24 hours of header versions.</h3>
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
        Bar heights count blocks. Dots mark hours containing alternative node
        markers, even when their share is tiny. Select an hour or a version to
        inspect its blocks.
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
              Alternative markers
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
                  to={`/explorer/block/${record.hash}`}
                  style={
                    { "--version-color": color(record) } as React.CSSProperties
                  }
                >
                  <img src={node.icon} width="25" height="25" alt="" />
                  <span>
                    <strong>#{record.height.toLocaleString()}</strong>
                    <small>
                      {time(record.time)} · {versionOf(record)}
                    </small>
                  </span>
                  <span>{node.name}</span>
                  <b aria-hidden="true">↗</b>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="header-history-empty">
            {scope.kind === "alternatives"
              ? "No alternative node markers in the verified blocks yet."
              : "No verified blocks match this selection."}
          </p>
        )}
        {matching.length > 12 && (
          <nav className="header-history-pages" aria-label="Header block pages">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ← Previous
            </button>
            <span>
              {currentPage + 1} / {Math.ceil(matching.length / 12)}
            </span>
            <button
              type="button"
              disabled={(currentPage + 1) * 12 >= matching.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next →
            </button>
          </nav>
        )}
      </section>
      <p className="header-history-note">
        Node identities follow protocol minor markers. Unrecognized versions are
        assumed Haskell cardano-node; they are not independently identified.
      </p>
    </div>
  );
}
