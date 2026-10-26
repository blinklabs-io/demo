import { useId, type ReactNode } from "react";
import { Link } from "react-router";

import { ratio } from "../../lib/visualFormat";

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="metric">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {detail && <span className="metric-detail">{detail}</span>}
    </div>
  );
}

export function Gauge({
  label,
  value,
  detail,
  tone = "teal",
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: "teal" | "violet" | "amber";
}) {
  const id = useId();
  const bounded = Math.min(
    100,
    Math.max(0, Number.isFinite(value) ? value : 0),
  );
  return (
    <figure className={`instrument-gauge gauge-${tone}`}>
      <svg viewBox="0 0 260 230" role="img" aria-labelledby={id}>
        <title id={id}>
          {label}: {value.toFixed(1)} percent{detail ? `. ${detail}` : ""}
        </title>
        <circle className="gauge-halo" cx="130" cy="120" r="94" />
        <circle
          className="gauge-track"
          cx="130"
          cy="120"
          r="88"
          pathLength="100"
          strokeDasharray="75 25"
          transform="rotate(135 130 120)"
        />
        <circle
          className="gauge-fill"
          cx="130"
          cy="120"
          r="88"
          pathLength="100"
          strokeDasharray={`${bounded * 0.75} ${100 - bounded * 0.75}`}
          transform="rotate(135 130 120)"
        />
        {Array.from({ length: 21 }, (_, i) => (
          <line
            key={i}
            className={i % 5 === 0 ? "gauge-tick major" : "gauge-tick"}
            x1="230"
            x2={i % 5 === 0 ? "240" : "235"}
            y1="120"
            y2="120"
            transform={`rotate(${135 + i * 13.5} 130 120)`}
          />
        ))}
        <text className="gauge-scale" x="44" y="213">
          0
        </text>
        <text className="gauge-scale" x="130" y="12" textAnchor="middle">
          50
        </text>
        <text className="gauge-scale" x="216" y="213" textAnchor="end">
          100
        </text>
        <g
          className="gauge-needle"
          transform={`rotate(${135 + bounded * 2.7} 130 120)`}
        >
          <line x1="118" y1="120" x2="202" y2="120" />
          <circle cx="130" cy="120" r="6" />
        </g>
        <text className="gauge-reading" x="130" y="176" textAnchor="middle">
          {value.toFixed(1)}
          <tspan>%</tspan>
        </text>
      </svg>
      <figcaption>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </figcaption>
    </figure>
  );
}

export function PageIntro({
  eyebrow,
  title,
  detail,
  symbol = "◈",
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  symbol?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="showcase-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {action}
      </div>
      <span className="showcase-symbol" aria-hidden="true">
        {symbol}
      </span>
    </header>
  );
}

export function Meter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  const percent = Math.min(
    100,
    Math.max(0, Number.isFinite(value) ? value : 0),
  );
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        <strong>{value.toFixed(1)}%</strong>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {detail && <small>{detail}</small>}
    </div>
  );
}

const colors = ["#2dd4bf", "#818cf8", "#fbbf24", "#f472b6", "#60a5fa"];
export function Distribution({
  title,
  items,
  unit = "",
}: {
  title: string;
  items: { label: string; value: bigint; display: string }[];
  unit?: string;
}) {
  const id = useId();
  const total = items.reduce(
    (sum, item) => sum + (item.value > 0n ? item.value : 0n),
    0n,
  );
  return (
    <div className="distribution">
      <div className="donut-wrap">
        <svg viewBox="0 0 180 180" role="img" aria-labelledby={id}>
          <title id={id}>
            {title}:{" "}
            {items.map((item) => `${item.label} ${item.display}`).join(", ")}
          </title>
          <circle
            cx="90"
            cy="90"
            r="67"
            fill="none"
            stroke="#243148"
            strokeWidth="20"
          />
          {items.map((item, i) => {
            const percent = ratio(item.value > 0n ? item.value : 0n, total);
            const start = items
              .slice(0, i)
              .reduce(
                (sum, previous) =>
                  sum + ratio(previous.value > 0n ? previous.value : 0n, total),
                0,
              );
            return (
              <circle
                key={item.label}
                cx="90"
                cy="90"
                r="67"
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="20"
                pathLength="100"
                strokeDasharray={`${percent} ${100 - percent}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
              >
                <title>
                  {item.label}: {item.display} ({percent.toFixed(1)}%)
                </title>
              </circle>
            );
          })}
          <text x="90" y="86" textAnchor="middle" className="donut-caption">
            {title}
          </text>
          <text x="90" y="108" textAnchor="middle" className="donut-total">
            {unit || (total === 0n ? "No data" : "100%")}
          </text>
        </svg>
      </div>
      <ul className="chart-legend">
        {items.map((item, i) => (
          <li key={item.label}>
            <span
              className="legend-dot"
              style={{ background: colors[i % colors.length] }}
            />
            <span>{item.label}</span>
            <strong title={item.value.toString()}>{item.display}</strong>
            <small>{ratio(item.value, total).toFixed(1)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; href?: string; detail?: string }[];
}) {
  const id = useId();
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 1) {
    const item = items[0];
    const value = (
      <>
        <strong>
          {item.value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
        </strong>
        <span>{item.label}</span>
      </>
    );
    return (
      <div className="single-observation">
        <span className="eyebrow">{title}</span>
        {item.href ? <Link to={item.href}>{value}</Link> : <div>{value}</div>}
      </div>
    );
  }

  if (items.length > 1 && items.every((item) => item.value === 0))
    return (
      <div className="zero-observations">
        <span aria-hidden="true">∅</span>
        <div>
          <strong>{title}</strong>
          <p>All {items.length} observations on this page are zero.</p>
        </div>
      </div>
    );
  if (!items.length)
    return <div className="visual-empty">No observations to chart yet.</div>;
  return (
    <div className="bar-chart">
      <div className="chart-scale">
        <span>{max.toLocaleString()}</span>
        <span>
          {(max / 2).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <span>0</span>
      </div>
      <div className="chart-plot" role="group" aria-labelledby={id}>
        <span id={id} className="sr-only">
          {title}
        </span>
        {items.map((item, i) => {
          const content = (
            <>
              <span
                className="chart-bar"
                style={{ height: `${Math.max(0, (item.value / max) * 100)}%` }}
              />
              <span className="chart-tooltip">
                {item.label}
                <strong>{item.value.toLocaleString()}</strong>
                {item.detail}
              </span>
            </>
          );
          return item.href ? (
            <Link
              key={`${item.label}:${i}`}
              className="chart-column"
              to={item.href}
              aria-label={`${item.label}: ${item.value} ${title}`}
            >
              {content}
            </Link>
          ) : (
            <button
              key={`${item.label}:${i}`}
              type="button"
              className="chart-column"
              aria-label={`${item.label}: ${item.value} ${title}`}
            >
              {content}
            </button>
          );
        })}
      </div>
      <div className="chart-axis">
        <span>{items[0].label}</span>
        <span>{items.at(-1)?.label}</span>
      </div>
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: { label: string; detail: ReactNode; complete: boolean }[];
}) {
  return (
    <ol className="timeline">
      {items.map((item, i) => (
        <li
          key={`${item.label}:${i}`}
          className={item.complete ? "complete" : ""}
        >
          <span className="timeline-node">{item.complete ? "✓" : i + 1}</span>
          <div>
            <strong>{item.label}</strong>
            <div className="timeline-detail">{item.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({
  title,
  detail,
  icon = "◇",
  action,
}: {
  title: string;
  detail: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="visual-empty">
      <span className="empty-orbit" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
