import { useId, useState, useEffect, useRef } from "react";

export function MarketChart({
  points,
  label,
}: {
  points: Array<{ time: number; value: number }>;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0].contentRect.width)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const right = width - 76;
  const plotWidth = right - 24;
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const sorted = points
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.time - b.time);
  if (!sorted.length)
    return (
      <div className="price-chart-empty" ref={container}>
        No pool reserve history available for this week.
      </div>
    );
  const last = sorted.at(-1)!;
  const end = last.time;
  const start = end - 7 * 86400000;
  const valid = sorted.filter((point) => point.time >= start);
  const low = Math.min(...valid.map((p) => p.value));
  const high = Math.max(...valid.map((p) => p.value));
  const pad = (high - low || high * 0.02) * 0.15;
  const min = low - pad,
    max = high + pad;
  const x = (time: number) => 24 + ((time - start) / (end - start)) * plotWidth;
  const y = (value: number) => 254 - ((value - min) / (max - min)) * 218;
  const number = (value: number) =>
    value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  const path = valid
    .map((p, i) => `${i ? "L" : "M"}${x(p.time)},${y(p.value)}`)
    .join(" ");
  const point =
    hover === null ? last : valid[Math.min(hover, valid.length - 1)];
  const select = (fraction: number) => {
    const time = start + Math.max(0, Math.min(1, fraction)) * (end - start);
    setHover(
      valid.reduce(
        (best, p, i) =>
          Math.abs(p.time - time) < Math.abs(valid[best].time - time)
            ? i
            : best,
        0,
      ),
    );
  };
  return (
    <div className="market-chart" ref={container}>
      <div className="market-chart-toolbar">
        <span className="status-badge">1W</span>
        <span>6h snapshots</span>
        <strong>{number(point.value)}</strong>
        <time>
          {new Date(point.time).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <svg
        viewBox={`0 0 ${width} 300`}
        role="img"
        aria-label={`${label}, weekly six-hour reserve prices`}
        tabIndex={0}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          select(
            (((event.clientX - bounds.left) / bounds.width) * width - 24) /
              plotWidth,
          );
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setHover(
              Math.max(
                0,
                Math.min(
                  valid.length - 1,
                  (hover ?? valid.length - 1) +
                    (event.key === "ArrowLeft" ? -1 : 1),
                ),
              ),
            );
          }
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#2dd4bf" stopOpacity=".3" />
            <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const value = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                x1="24"
                x2={right}
                y1={y(value)}
                y2={y(value)}
                stroke="#243a48"
              />
              <text x={right + 10} y={y(value) + 4}>
                {number(value)}
              </text>
            </g>
          );
        })}
        {(width < 460 ? [0, 2, 4, 7] : [0, 1, 2, 3, 4, 5, 6, 7]).map((i) => {
          const time = start + i * 86400000;
          return (
            <g key={i}>
              <line
                x1={x(time)}
                x2={x(time)}
                y1="25"
                y2="254"
                stroke="#1d303d"
              />
              <text
                x={x(time)}
                y="283"
                textAnchor={i === 0 ? "start" : i === 7 ? "end" : "middle"}
              >
                {new Date(time).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </text>
            </g>
          );
        })}
        <path
          d={`${path} L${x(last.time)},254 L${x(valid[0].time)},254 Z`}
          fill={`url(#${id})`}
        />
        <path d={path} stroke="#2dd4bf" strokeWidth="2" fill="none" />
        <line
          x1="24"
          x2={right}
          y1={y(last.value)}
          y2={y(last.value)}
          stroke="#2dd4bf"
          strokeDasharray="4 5"
          opacity=".5"
        />
        <line
          x1={x(point.time)}
          x2={x(point.time)}
          y1="25"
          y2="254"
          stroke="#9bb4c5"
          strokeDasharray="3 4"
        />
        <line
          x1="24"
          x2={right}
          y1={y(point.value)}
          y2={y(point.value)}
          stroke="#9bb4c5"
          strokeDasharray="3 4"
        />
        <circle cx={x(point.time)} cy={y(point.value)} r="4" fill="#c7fff1" />
      </svg>
    </div>
  );
}
