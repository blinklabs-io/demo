import { useId } from "react";

export function PriceChart({
  points,
  label,
  timeScale = "time",
}: {
  points: Array<{ time: number; value: number; label?: string }>;
  label: string;
  timeScale?: "time" | "date";
}) {
  const id = useId().replace(/:/g, "");
  const valid = points.filter((point) => Number.isFinite(point.value));
  if (!valid.length)
    return (
      <div className="price-chart-empty">
        Waiting for the first observation…
      </div>
    );
  const low = Math.min(...valid.map((point) => point.value));
  const high = Math.max(...valid.map((point) => point.value));
  const spread = high - low || Math.abs(high) * 0.02 || 1;
  const tickLabel = (time: number) =>
    timeScale === "date"
      ? new Date(time).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : new Date(time).toLocaleTimeString();
  const first = valid[0].time;
  const last = valid.at(-1)!.time;
  const x = (time: number) =>
    valid.length === 1
      ? 300
      : 50 + ((time - first) / Math.max(last - first, 1)) * 500;
  const y = (value: number) =>
    175 - ((value - low + spread * 0.15) / (spread * 1.3)) * 140;
  const path = valid
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(point.time)},${y(point.value)}`,
    )
    .join(" ");
  const number = (value: number) =>
    value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  return (
    <figure className="price-chart">
      <svg
        viewBox="0 0 620 220"
        role="img"
        aria-label={`${label}: ${valid.length} observations, ${number(low)} to ${number(high)}`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#36e6c0" stopOpacity=".32" />
            <stop offset="1" stopColor="#36e6c0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 85, 130, 175].map((height) => (
          <line
            key={height}
            x1="50"
            x2="550"
            y1={height}
            y2={height}
            stroke="#273846"
            strokeDasharray="3 6"
          />
        ))}
        {valid.length > 1 && (
          <path d={`${path} L550,190 L50,190 Z`} fill={`url(#${id})`} />
        )}
        <path
          d={path}
          fill="none"
          stroke="#36e6c0"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {valid.map((point) => (
          <circle
            key={point.time}
            cx={x(point.time)}
            cy={y(point.value)}
            r={valid.length === 1 ? 5 : 3}
            fill="#7cf5dd"
            tabIndex={0}
          >
            <title>
              {point.label ? `${point.label} · ` : ""}
              {new Date(point.time).toLocaleString()}: {number(point.value)}
            </title>
          </circle>
        ))}
        <text x="560" y="45" fill="#9db3bf" fontSize="11">
          {number(high)}
        </text>
        <text x="560" y="175" fill="#9db3bf" fontSize="11">
          {number(low)}
        </text>
        {timeScale === "time" && (
          <>
            <text x="50" y="212" fill="#9db3bf" fontSize="11">
              {tickLabel(first)}
            </text>
            <text x="550" y="212" textAnchor="end" fill="#9db3bf" fontSize="11">
              {tickLabel(last)}
            </text>
          </>
        )}
      </svg>
      {timeScale === "date" && (
        <div className="flex justify-between gap-2 text-xs text-slate-400">
          <span>{tickLabel(first)}</span>
          <span>{tickLabel(last)}</span>
        </div>
      )}
      {valid.length === 1 && (
        <figcaption>One observation available.</figcaption>
      )}
    </figure>
  );
}
