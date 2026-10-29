import { useId, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { fraction, visualColors } from "../../lib/chain/geometry";
import { formatAda } from "../../lib/format";
interface Epoch {
  epoch: number;
  start_time: number;
  end_time: number;
  first_block_time: number;
  last_block_time: number;
  block_count: number;
  tx_count: number;
  output: string;
  fees: string;
  active_stake: string | null;
}
const axes = [
  {
    name: "Blocks",
    get: (e: Epoch) => BigInt(e.block_count),
    format: (n: bigint) => n.toLocaleString(),
  },
  {
    name: "Transactions",
    get: (e: Epoch) => BigInt(e.tx_count),
    format: (n: bigint) => n.toLocaleString(),
  },
  {
    name: "Output ADA",
    get: (e: Epoch) => BigInt(e.output),
    format: formatAda,
  },
  { name: "Fees", get: (e: Epoch) => BigInt(e.fees), format: formatAda },
  {
    name: "Active stake",
    get: (e: Epoch) =>
      e.active_stake === null ? null : BigInt(e.active_stake),
    format: formatAda,
  },
];
export function EpochFingerprints({
  epoch,
  currentEpoch,
}: {
  epoch: number;
  currentEpoch?: number;
}) {
  return <Fingerprints key={epoch} epoch={epoch} currentEpoch={currentEpoch} />;
}
function Fingerprints({
  epoch,
  currentEpoch,
}: {
  epoch: number;
  currentEpoch?: number;
}) {
  const [open, setOpen] = useState(false),
    [count, setCount] = useState(3),
    [hover, setHover] = useState<number | null>(null);
  const uid = useId();
  const numbers = Array.from(
    { length: Math.min(count, epoch + 1) },
    (_, i) => epoch - i,
  ).reverse();
  const queries = useQueries({
    queries: numbers.map((n) => ({
      queryKey: ["dingo", "epoch", n],
      enabled: open,
      retry: false,
      staleTime: 60000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        blockfrostFetch<Epoch>(`/api/v0/epochs/${n}`, { signal }),
    })),
  });
  const loaded = queries.flatMap((q) => (q.data ? [q.data] : []));
  const availableAxes = axes.filter(
    (a) => loaded.length > 0 && loaded.every((e) => a.get(e) !== null),
  );
  const maxima = availableAxes.map((a) =>
    loaded.reduce((n, e) => {
      const v = a.get(e)!;
      return v > n ? v : n;
    }, 0n),
  );
  const point = (index: number, r: number) => {
    const angle =
      -Math.PI / 2 + (index / Math.max(availableAxes.length, 1)) * Math.PI * 2;
    return { x: 300 + Math.cos(angle) * r, y: 250 + Math.sin(angle) * r };
  };
  const polygon = (radius: number) =>
    availableAxes
      .map((_, i) => {
        const p = point(i, radius);
        return `${p.x},${p.y}`;
      })
      .join(" ");
  return (
    <section className="chain-visual epoch-fingerprints">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">No two epochs are alike</span>
          <h2>The shape of an epoch.</h2>
        </div>
        {open ? (
          <label className="chain-select">
            Compare
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="Number of epochs to compare"
            >
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} recent epochs
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button onClick={() => setOpen(true)}>
            Compare epoch fingerprints
          </button>
        )}
      </header>
      {!open ? (
        <div className="fingerprint-teaser" aria-hidden="true">
          <svg viewBox="0 0 600 300">
            <path d="M300 25 475 145 410 270 190 270 125 145Z" />
            <path d="M300 80 430 145 360 230 240 210 180 145Z" />
            <path d="M300 45 375 145 400 250 235 220 165 145Z" />
          </svg>
        </div>
      ) : (
        <>
          <div className="fingerprint-layout">
            <svg
              viewBox="0 0 600 500"
              role="img"
              aria-labelledby={`${uid}-title`}
            >
              <title id={`${uid}-title`}>
                Epoch activity shapes, normalized independently per axis against
                the largest loaded comparison value. Exact values are in the
                table.
              </title>
              {loaded.length === 0 && (
                <>
                  <circle
                    cx="300"
                    cy="250"
                    r="145"
                    fill="none"
                    stroke="#35515d"
                    strokeDasharray="4 12"
                  />
                  <text
                    x="300"
                    y="250"
                    textAnchor="middle"
                    fill="#94b6c0"
                    fontSize="16"
                  >
                    {queries.some((q) => q.isPending)
                      ? "Reading epoch shapes…"
                      : "Epoch totals unavailable"}
                  </text>
                </>
              )}
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <polygon
                  key={r}
                  points={polygon(170 * r)}
                  fill="none"
                  stroke="#345161"
                  strokeDasharray="3 6"
                />
              ))}
              {availableAxes.map((a, i) => {
                const p = point(i, 170),
                  label = point(i, 208);
                return (
                  <g key={a.name}>
                    <path d={`M300 250L${p.x} ${p.y}`} stroke="#345161" />
                    <text
                      x={label.x}
                      y={label.y}
                      textAnchor="middle"
                      fill="#aac4cf"
                      fontSize="14"
                    >
                      {a.name}
                    </text>
                  </g>
                );
              })}
              {loaded.map((e) => {
                const index = numbers.indexOf(e.epoch),
                  color = visualColors[index % visualColors.length];
                const points = availableAxes
                  .map((a, i) => {
                    const p = point(i, 170 * fraction(a.get(e)!, maxima[i]));
                    return `${p.x},${p.y}`;
                  })
                  .join(" ");
                return (
                  <g
                    key={e.epoch}
                    opacity={hover === null || hover === e.epoch ? 1 : 0.12}
                  >
                    <polygon
                      points={points}
                      fill={color}
                      fillOpacity=".12"
                      stroke={color}
                      strokeWidth="2.5"
                    />
                    {availableAxes.map((a, i) => {
                      const p = point(i, 170 * fraction(a.get(e)!, maxima[i]));
                      return (
                        <circle
                          key={a.name}
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          fill={color}
                        >
                          <title>
                            Epoch {e.epoch} · {a.name}: {a.format(a.get(e)!)}
                          </title>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <div className="fingerprint-cards">
              {queries.map((q, i) => {
                const number = numbers[i],
                  color = visualColors[i % visualColors.length];
                return (
                  <div
                    key={number}
                    className="fingerprint-card"
                    style={{ borderColor: color }}
                    onMouseEnter={() => setHover(number)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(number)}
                    onBlur={() => setHover(null)}
                  >
                    <Link to={`/explorer/epoch/${number}`}>
                      Epoch {number} ↗
                    </Link>
                    <span>
                      {number === currentEpoch
                        ? "Latest observed · partial"
                        : currentEpoch === undefined
                          ? "Completion unverified"
                          : number < currentEpoch
                            ? "Completed"
                            : "Future epoch"}
                    </span>
                    {q.isPending && <p role="status">Reading epoch totals…</p>}
                    {q.error && (
                      <p className="chain-error" role="alert">
                        {q.error.message}{" "}
                        <button onClick={() => void q.refetch()}>
                          Retry epoch {number}
                        </button>
                      </p>
                    )}
                    {q.data && (
                      <>
                        <strong>
                          {q.data.tx_count.toLocaleString()}
                          <small>transactions</small>
                        </strong>
                        <span>
                          {q.data.block_count.toLocaleString()} blocks ·{" "}
                          {formatAda(BigInt(q.data.fees))} fees
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="chain-footnote">
            Each axis is scaled separately to the largest loaded value in this
            comparison; shapes show relative activity, not absolute magnitude.{" "}
            {availableAxes.length < axes.length
              ? "Active stake is omitted from the shape until every compared epoch has a value. "
              : ""}
            The latest observed epoch may have incomplete totals. No individual
            blocks are fetched for this comparison.
          </p>
          <div className="chain-table-wrap">
            <table className="chain-table">
              <caption>Exact epoch comparison values</caption>
              <thead>
                <tr>
                  <th>Epoch</th>
                  {axes.map((a) => (
                    <th key={a.name}>{a.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loaded.map((e) => (
                  <tr key={e.epoch}>
                    <th>
                      <Link to={`/explorer/epoch/${e.epoch}`}>
                        {e.epoch}
                        {e.epoch === currentEpoch ? " · partial" : ""}
                      </Link>
                    </th>
                    {axes.map((a) => (
                      <td key={a.name}>
                        {a.get(e) === null
                          ? "Not available"
                          : a.format(a.get(e)!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
