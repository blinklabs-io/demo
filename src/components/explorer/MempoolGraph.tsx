import { useState } from "react";
import type { PendingTx } from "../../lib/dingo/utxorpc/streaming";
import type { MempoolStatus } from "../../stores/mempoolStore";
import { MEMPOOL_GRAPH_PAGE_SIZE, mempoolGraph } from "../../lib/explorer/mempoolGraph";
import { useCompactVisual } from "../../lib/chain/useCompactVisual";
import { formatNativeCoin, shortenHash } from "../../lib/format";
import { HashLink } from "./HashLink";
import { Pagination } from "./Pagination";
import { MempoolOverview } from "./MempoolOverview";
import "./mempool-graph.css";

function outputAmounts(output: PendingTx["outputs"][number]) {
  return [formatNativeCoin(output.lovelace), ...output.assets.map((asset) => `${asset.quantity.toLocaleString()} base units of ${asset.unit}`)].join(" + ");
}

export function MempoolGraph({ transactions, status }: { transactions: PendingTx[]; status: MempoolStatus }) {
  const compact = useCompactVisual();
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("");
  const [mode, setMode] = useState<"overview" | "transactions">("overview");
  const overview = transactions.length > MEMPOOL_GRAPH_PAGE_SIZE && mode === "overview";
  const lastPage = Math.max(1, Math.ceil(transactions.length / MEMPOOL_GRAPH_PAGE_SIZE));
  if (page > lastPage) setPage(lastPage);
  if (active && !transactions.some((tx) => tx.hash === active)) setActive("");
  const start = (Math.min(page, lastPage) - 1) * MEMPOOL_GRAPH_PAGE_SIZE;
  const selected = transactions.find((tx) => tx.hash === active);
  const shown = overview ? selected ? [selected] : [] : transactions.slice(start, start + MEMPOOL_GRAPH_PAGE_SIZE);
  const graph = mempoolGraph(shown, compact);
  return (
    <section className="mempool-web" aria-label="Mempool transaction web">
      <header>
        <div><span className="eyebrow">Value in motion</span><h2>Before the chain connects.</h2></div>
        <span className="status-badge">{transactions.length.toLocaleString()} pending · {status === "live" ? "Live" : status === "error" ? "Reconnecting" : status === "connecting" ? "Connecting" : "Not started"}</span>
      </header>
      {status !== "live" && transactions.length > 0 && <p role="status">Showing the last observed pending set while the feed reconnects.</p>}
      <p>Choose a transaction to inspect its fee, inputs, and outputs. Purple links connect dependent pending transactions.</p>
      {transactions.length > MEMPOOL_GRAPH_PAGE_SIZE && <nav className="mempool-overview-modes" aria-label="Mempool view">
        <button type="button" aria-pressed={overview} onClick={() => setMode("overview")}>Whole mempool</button>
        <button type="button" aria-pressed={!overview} onClick={() => setMode("transactions")}>Transaction view</button>
      </nav>}
      {transactions.length > MEMPOOL_GRAPH_PAGE_SIZE && <div hidden={!overview}><MempoolOverview transactions={transactions} active={active} onSelect={setActive} /></div>}
      <div className="mempool-web-legend"><span>● Inputs</span><span>● Transaction & fee</span><span>● Outputs</span></div>
      {shown.length > 0 ? <>
        <div className="mempool-web-canvas">
          <svg viewBox={`0 0 ${graph.width} ${graph.height}`} aria-label="Pending transactions connected to their inputs and outputs">
            {graph.dependencies.map((edge, index) => <path key={index} className="mempool-dependency" d={`M${edge.from.x},${edge.from.y} C${edge.from.x + 70},${edge.from.y} ${edge.to.x - 70},${edge.to.y} ${edge.to.x},${edge.to.y}`}><title>Pending dependency: {edge.parent} → {edge.child}</title></path>)}
            {graph.nodes.map((node) => <g key={node.tx.hash} className={selected?.hash === node.tx.hash ? "mempool-cluster selected" : "mempool-cluster"}>
              {node.inputs.map((port) => <g key={`in:${port.index}`} className="mempool-input"><path d={`M${port.x},${port.y} Q${node.x},${port.y} ${node.x},${node.y}`} /><circle cx={port.x} cy={port.y} r="9"><title>Input {port.index + 1}: {node.tx.inputs[port.index].hash}#{node.tx.inputs[port.index].index}</title></circle></g>)}
              {node.outputs.map((port) => <g key={`out:${port.index}`} className="mempool-output"><path d={`M${node.x},${node.y} Q${node.x},${port.y} ${port.x},${port.y}`} /><circle cx={port.x} cy={port.y} r="9"><title>Output {port.index + 1}: {outputAmounts(node.tx.outputs[port.index])} to {node.tx.outputs[port.index].address}</title></circle></g>)}
              <g role="button" tabIndex={0} aria-pressed={selected?.hash === node.tx.hash} aria-label={`Inspect transaction ${node.tx.hash}, fee ${formatNativeCoin(node.tx.fee)}`} className="mempool-tx-hub" onClick={() => setActive(node.tx.hash)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(node.tx.hash); } }}>
                <title>{node.tx.hash} · Fee {formatNativeCoin(node.tx.fee)} · Outputs: {node.tx.outputs.map((output, index) => `#${index}: ${outputAmounts(output)}`).join("; ")}</title>
                <circle className="mempool-halo" cx={node.x} cy={node.y} r="48" />
                <circle cx={node.x} cy={node.y} r="40" />
                <text x={node.x} y={node.y - 5} textAnchor="middle">TX</text>
                <text className="mempool-fee" x={node.x} y={node.y + 15} textAnchor="middle">{formatNativeCoin(node.tx.fee)}</text>
              </g>
              <text className="mempool-port-label" x={node.x - 120} y={node.y + 102} textAnchor="middle">{node.tx.inputCount} inputs{node.tx.inputCount > 6 ? " · 6 drawn" : ""}</text>
              <text className="mempool-port-label" x={node.x + 120} y={node.y + 102} textAnchor="middle">{node.tx.outputCount} outputs{node.tx.outputCount > 6 ? " · 6 drawn" : ""}</text>
              <text className="mempool-hash-label" x={node.x} y={node.y + 65} textAnchor="middle">{shortenHash(node.tx.hash, 5)}</text>
            </g>)}
          </svg>
        </div>
        <p className="mempool-web-scope">{overview ? "Selected transaction" : `Showing ${start + 1}–${start + shown.length} of ${transactions.length.toLocaleString()} pending transactions`}. Up to six inputs and outputs are drawn per hub; inspect all of them below.</p>
        {!overview && <Pagination page={Math.min(page, lastPage)} onPageChange={setPage} hasNextPage={page < lastPage} />}
      </> : !overview && <div className="mempool-web-empty"><span aria-hidden="true">✧</span><p>Waiting for the next connection.</p></div>}
      {selected && <section className="mempool-web-detail" aria-label="Selected pending transaction">
        <header><div><span className="eyebrow">Pending transaction</span><HashLink kind="tx" id={selected.hash} /></div><strong>{formatNativeCoin(selected.fee)} fee</strong></header>
        <div className="mempool-web-io">
          <div><h3>{selected.inputs.length} inputs</h3><ol>{selected.inputs.map((input, index) => <li key={index}><HashLink kind="tx" id={input.hash} /><span>Output #{input.index}</span></li>)}</ol></div>
          <div><h3>{selected.outputs.length} outputs</h3><ol>{selected.outputs.map((output, index) => <li key={index}><HashLink kind="address" id={output.address} /><span>#{index} · {formatNativeCoin(output.lovelace)}</span>{output.assets.map((asset) => <div key={asset.unit}><HashLink kind="asset" id={asset.unit} /><span>{asset.quantity.toLocaleString()} base units</span></div>)}</li>)}</ol></div>
        </div>
      </section>}
    </section>
  );
}
