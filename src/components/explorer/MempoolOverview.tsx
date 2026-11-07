import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { PendingTx } from "../../lib/dingo/utxorpc/streaming";
import { mempoolOverview, reconcileMempoolSlots } from "../../lib/explorer/mempoolGraph";
import { formatAda } from "../../lib/format";
const feeAmount = (fee: bigint) => formatAda(fee).replace(/ ADA$/, "");

function boundedCenter(point: { x: number; y: number }, zoom: number) {
  const halfWidth = 500 / zoom, halfHeight = 300 / zoom;
  return { x: Math.max(halfWidth, Math.min(1000 - halfWidth, point.x)), y: Math.max(halfHeight, Math.min(600 - halfHeight, point.y)) };
}

export const MempoolOverview = memo(function MempoolOverview({ transactions, active, onSelect }: {
  transactions: PendingTx[];
  active: string;
  onSelect: (hash: string) => void;
}) {
  const [slots, setSlots] = useState(() => reconcileMempoolSlots(transactions, new Map()));
  const current = useMemo(() => reconcileMempoolSlots(transactions, slots), [transactions, slots]);
  if (current !== slots) setSlots(current);
  const graph = useMemo(() => mempoolOverview(transactions, current), [transactions, current]);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 500, y: 300 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const term = search.trim().toLowerCase();
  const matches = useMemo(() => transactions.filter((tx) => tx.hash.includes(term)), [transactions, term]);
  const selected = graph.nodes.find((node) => node.tx.hash === active);
  const inspect = useCallback((hash: string) => {
    onSelect(hash);
    const node = graph.nodes.find((item) => item.tx.hash === hash);
    if (node && zoom > 1) setCenter(boundedCenter(node, zoom));
  }, [graph, onSelect, zoom]);
  const scene = useMemo(() => <>
    {graph.dependencies.map((edge, index) => <line key={index} className="mempool-overview-edge" x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} style={{ opacity: active ? edge.from.tx.hash === active || edge.to.tx.hash === active ? 0.9 : 0.06 : 0.24 }} />)}
    {graph.nodes.map((node, index) => <g
      key={node.tx.hash} className="mempool-overview-node" role="button" tabIndex={active ? active === node.tx.hash ? 0 : -1 : index === 0 ? 0 : -1}
      aria-label={`Inspect transaction ${node.tx.hash}, fee ${feeAmount(node.tx.fee)} native coins`} aria-pressed={active === node.tx.hash}
      data-hash={node.tx.hash} data-x={node.x} data-y={node.y}
      onClick={() => { if (!dragged.current) inspect(node.tx.hash); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(node.tx.hash); return; }
        const offset = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        if (!offset && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? graph.nodes.length - 1 : (index + offset + graph.nodes.length) % graph.nodes.length;
        const next = graph.nodes[nextIndex];
        inspect(next.tx.hash);
        event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(".mempool-overview-node")[nextIndex]?.focus();
      }}
      style={{ opacity: term && !node.tx.hash.includes(term) ? 0.15 : 1 }}
    >
      <title>{node.tx.hash} · Fee {feeAmount(node.tx.fee)} · {node.tx.inputCount} inputs · {node.tx.outputCount} outputs. Select to inspect output amounts.</title>
      <circle cx={node.x} cy={node.y} r={node.radius} />
    </g>)}
    {selected && <g className="mempool-overview-selected" pointerEvents="none">
      <circle cx={selected.x} cy={selected.y} r={selected.radius + 6} />
      <text x={selected.x} y={selected.y - 17} textAnchor="middle">{feeAmount(selected.tx.fee)} fee</text>
    </g>}
  </>, [graph, active, term, selected, inspect]);
  function changeZoom(next: number) {
    const nextZoom = Math.max(1, Math.min(4, next));
    setZoom(nextZoom);
    setCenter((point) => boundedCenter(selected ?? point, nextZoom));
  }
  return <div className="mempool-overview">
    <div className="mempool-overview-tools">
      <form onSubmit={(event) => { event.preventDefault(); if (term && matches[0]) inspect(matches[0].hash); }}>
        <input type="search" aria-label="Find pending transaction" placeholder="Find a transaction hash…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="submit" disabled={!term || !matches.length}>Inspect match</button>
      </form>
      <div>
        <button type="button" aria-label="Zoom out" disabled={zoom === 1} onClick={() => changeZoom(zoom / 1.5)}>−</button>
        <button type="button" aria-label="Zoom in" disabled={zoom === 4} onClick={() => changeZoom(zoom * 1.5)}>+</button>
        <button type="button" onClick={() => { setZoom(1); setCenter({ x: 500, y: 300 }); }}>Reset view</button>
      </div>
    </div>
    {term && <p role="status">{matches.length.toLocaleString()} matching pending transactions</p>}
    <svg className="mempool-overview-canvas" viewBox="0 0 1000 600" role="group" aria-label="All pending transactions" onPointerDown={(event) => {
      if (event.button !== 0) return;
      dragged.current = false;
      if (event.pointerType === "touch") return;
      if ((event.target as Element).closest(".mempool-overview-node")) return;
      drag.current = { x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      if (!drag.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
      const scale = Math.min(rect.width / 1000, rect.height / 600);
      if (scale <= 0) return;
      if (Math.abs(event.clientX - drag.current.originX) + Math.abs(event.clientY - drag.current.originY) > 3) drag.current.moved = true;
      dragged.current = drag.current.moved;
      if (drag.current.moved) setCenter((point) => boundedCenter({ x: point.x - dx / scale / zoom, y: point.y - dy / scale / zoom }, zoom));
      drag.current.x = event.clientX; drag.current.y = event.clientY;
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <g transform={`translate(500 300) scale(${zoom}) translate(${-center.x} ${-center.y})`}>{scene}</g>
    </svg>
    <p className="mempool-web-scope">All {transactions.length.toLocaleString()} pending transactions · circle size scales with fee · lines show pending dependencies. Drag with a mouse to pan, use +/− to zoom, and select a transaction to reveal its inputs and outputs. Use arrow keys, Home, or End to navigate transactions.</p>
  </div>;
});
