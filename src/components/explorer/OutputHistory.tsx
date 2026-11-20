import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "../NetworkLink";
import { Panel } from "./Panel";
import { formatNativeCoin } from "../../lib/format";
import { decodeKupoMatch, kupoMatchesPath, readKupo, type KupoMatch } from "../../lib/dingo/kupo";

function OutputData({ kind, hash }: { kind: "datums" | "scripts"; hash: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["dingo", "output-data", kind, hash],
    queryFn: ({ signal }) => readKupo(`/${kind}/${hash}`, signal),
    enabled: open, retry: false,
  });
  return <details className="mt-2 text-sm" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sky-300">{kind === "datums" ? "Inspect datum" : "Inspect reference script"}</summary>
    <p className="break-all text-xs text-slate-400">{hash}</p>
    {query.isFetching && <p role="status">Resolving indexed data…</p>}
    {query.error && <p role="alert" className="text-rose-300">{query.error.message}</p>}
    {query.data && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs">{JSON.stringify(query.data.data, null, 2)}</pre>}
  </details>;
}

export function OutputHistory({ pattern }: { pattern: string }) {
  return <OutputHistoryContent key={pattern} pattern={pattern} />;
}

function OutputHistoryContent({ pattern }: { pattern: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"all" | "spent" | "unspent">("all");
  const [before, setBefore] = useState(""), [beforeDraft, setBeforeDraft] = useState("");
  const validSlot = !beforeDraft || (/^[1-9]\d{0,15}$/.test(beforeDraft) && Number.isSafeInteger(Number(beforeDraft)));
  const query = useQuery({
    queryKey: ["dingo", "output-history", pattern, state, before],
    queryFn: ({ signal }) => readKupo(kupoMatchesPath(pattern, state) + (before ? `&created_before=${before}` : ""), signal),
    enabled: open, retry: false,
  });
  const rows: KupoMatch[] = [], errors: string[] = [];
  if (query.data) {
    if (!Array.isArray(query.data.data)) errors.push("The index returned an unsupported output list.");
    else for (const value of query.data.data) {
      try { rows.push(decodeKupoMatch(value)); }
      catch (cause) { errors.push(cause instanceof Error ? cause.message : "Unsupported output."); }
    }
  }
  return <Panel title="Output history">
    <p className="mb-3 text-sm text-slate-400">Inspect indexed outputs, including those already spent, and resolve their datum and script data.</p>
    {!open ? <button className="experience-primary" onClick={() => setOpen(true)}>Show output history</button> : <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Output state<select className="block rounded border border-slate-700 bg-slate-950 p-2" value={state} onChange={event => setState(event.target.value as typeof state)}><option value="all">All indexed outputs</option><option value="unspent">Unspent</option><option value="spent">Spent</option></select></label>
        <label className="text-sm">Created before slot<input inputMode="numeric" className="block min-w-0 rounded border border-slate-700 bg-slate-950 p-2" placeholder="Optional" value={beforeDraft} onChange={event => setBeforeDraft(event.target.value)} /></label>
        <button className="experience-primary" disabled={!validSlot} onClick={() => setBefore(beforeDraft)}>Apply slot filter</button>
        <button className="experience-primary" disabled={!validSlot || query.isFetching} onClick={() => void query.refetch()}>Refresh outputs</button>
      </div>
      {!validSlot && <p role="alert" className="text-rose-300">Enter a positive whole slot number.</p>}
      {query.isFetching && <p role="status">Reading output history…</p>}
      {query.error && <p role="alert" className="text-rose-300">{query.error.message}</p>}
      {query.data && <>
        <p className="mb-3 text-sm text-slate-400">{rows.length} supported outputs{before ? ` · created before slot ${before}` : ""}{query.data.truncated ? " · first 20 records; refine the state or slot filter for another subset" : ""}. Quantities use exact ledger units.</p>
        {errors.length > 0 && <details className="mb-3"><summary>{errors.length} unsupported records</summary>{errors.map((message, i) => <p key={i}>{message}</p>)}</details>}
        <div className="space-y-3">{rows.map(row => <article className="min-w-0 rounded-xl border border-slate-700 p-4 text-sm" key={`${row.transaction_id}#${row.output_index}`}>
          <Link className="block break-all text-sky-300" to={`/explorer/tx/${row.transaction_id}`}>{row.transaction_id}#{row.output_index}</Link>
          <p className="mt-2">{row.spent_at ? "Spent" : "Unspent"} · created at slot {row.created_at.slot_no.toLocaleString("en-US")}{row.spent_at ? ` · spent at slot ${row.spent_at.slot_no.toLocaleString("en-US")}` : ""}</p>
          <p className="mt-2 font-semibold text-emerald-300">{formatNativeCoin(BigInt(row.value.coins))}</p>
          {Object.entries(row.value.assets).map(([unit, amount]) => <p className="mt-1 break-all" key={unit}>{amount} base units · <Link to={`/explorer/asset/${unit.replace(".", "")}`}>{unit}</Link></p>)}
          <Link className="mt-2 block break-all text-xs text-slate-400" to={`/explorer/address/${row.address}`}>{row.address}</Link>
          {row.datum_hash && <OutputData kind="datums" hash={row.datum_hash} />}
          {row.script_hash && <OutputData kind="scripts" hash={row.script_hash} />}
        </article>)}</div>
      </>}
    </>}
  </Panel>;
}
