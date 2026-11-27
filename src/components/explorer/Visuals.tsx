import { Icon } from "../Icon";
import { useId, type ReactNode } from "react";
import { Link } from "../NetworkLink";

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
    <div
      className={`metric${(typeof value === "string" || typeof value === "number" || typeof value === "bigint") && String(value).length > 10 ? " metric-wide" : ""}`}
    >
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
  tone?: "teal" | "violet" | "amber" | "red";
}) {
  const id = useId();
  const bounded = Math.min(
    100,
    Math.max(0, Number.isFinite(value) ? value : 0),
  );
  return (
    <figure className={`instrument-gauge gauge-${tone}`}>
      <figcaption>{label}</figcaption>
      <p className="gauge-reading">
        {value.toFixed(1)}
        <span>%</span>
      </p>
      <svg
        viewBox="0 0 100 2"
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>
          {label}: {value.toFixed(1)} percent{detail ? `. ${detail}` : ""}
        </title>
        <rect className="gauge-track" width="100" height="2" />
        <rect className="gauge-fill" width={bounded} height="2" />
      </svg>
      {detail && <small>{detail}</small>}
    </figure>
  );
}

export function PageIntro({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="showcase-intro">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {action}
      </div>
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

const compact = (value: number) =>
  value.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
const colors = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
];
export function Distribution({
  title,
  items,
  unit = "",
}: {
  title: string;
  items: { label: string; value: bigint; display: string }[];
  unit?: string;
}) {
  const total = items.reduce(
    (sum, item) => sum + (item.value > 0n ? item.value : 0n),
    0n,
  );
  return (
    <div className="distribution">
      {unit && (
        <p className="distribution-total">
          <strong>{unit}</strong> {title}
        </p>
      )}
      <div
        className="stack-bar"
        role="img"
        aria-label={`${title}: ${items.map((item) => `${item.label} ${item.display}`).join(", ")}`}
      >
        {items.map((item, i) => {
          const percent = ratio(item.value > 0n ? item.value : 0n, total);
          return (
            <span
              key={item.label}
              title={`${item.label}: ${item.display} (${percent.toFixed(1)}%)`}
              style={{ flexGrow: percent, background: colors[i % colors.length] }}
            />
          );
        })}
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
        <span>{compact(max)}</span>
        <span>
          {items.every((item) => Number.isInteger(item.value)) && max % 2
            ? ""
            : compact(max / 2)}
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
          <span className="timeline-node">{item.complete ? <Icon name="check" size={16} /> : i + 1}</span>
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
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="visual-empty">
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
