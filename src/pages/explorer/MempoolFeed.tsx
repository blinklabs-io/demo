import { Metric, PageIntro } from "../../components/explorer/Visuals";
import { useMempoolStore } from "../../stores/mempoolStore";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { formatAda } from "../../lib/format";
import { useNow } from "../../lib/useNow";

function formatAge(seenAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - seenAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export default function MempoolFeed() {
  const status = useMempoolStore((state) => state.status);
  const error = useMempoolStore((state) => state.error);
  const pendingTxs = useMempoolStore((state) => state.pendingTxs);
  const now = useNow();

  const sorted = [...pendingTxs.values()].sort((a, b) => b.seenAt - a.seenAt);

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Before the next block"
        title="The waiting room."
        detail="Live transaction arrivals, streamed directly from Dingo."
        symbol="≋"
      />
      <Panel
        title={
          <span className="flex items-center gap-2">
            Mempool
            <span
              className={`h-2 w-2 rounded-full ${
                status === "live"
                  ? "bg-emerald-500"
                  : status === "error"
                    ? "bg-red-500"
                    : "bg-amber-500"
              }`}
            />
            <span className="text-xs font-normal text-slate-500">
              {status === "live" && `${sorted.length} pending`}
              {status === "connecting" && "connecting…"}
              {status === "error" && "reconnecting…"}
              {status === "idle" && "not started"}
            </span>
          </span>
        }
      >
        <div className="metric-grid mb-6">
          <Metric label="Pending transactions" value={sorted.length} />
          <Metric
            label="Total fees"
            value={formatAda(sorted.reduce((sum, tx) => sum + tx.fee, 0n))}
          />
          <Metric
            label="Live feed"
            value={status === "live" ? "Connected" : "Connecting"}
          />
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Transactions waiting to be included in a block. Updates arrive live
          from Dingo.
        </p>

        {error && status === "error" && (
          <p className="mb-3 text-sm text-red-400">{error}</p>
        )}

        {status === "live" && sorted.length === 0 && !error && (
          <div className="mempool-radar-empty">
            <div className="mempool-radar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="radar-sweep" />
              <b>0</b>
            </div>
            <div>
              <span className="eyebrow">Live feed connected</span>
              <h2>Clear for the next block.</h2>
              <p>
                No transactions are waiting. New arrivals appear automatically.
              </p>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {sorted.map((tx) => (
            <li
              key={tx.hash}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <HashLink kind="tx" id={tx.hash} visible={10} />
                <span className="text-xs text-slate-500">
                  {tx.inputCount} in · {tx.outputCount} out
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{formatAda(tx.totalOutputLovelace)}</span>
                <span>fee {formatAda(tx.fee)}</span>
                <span className="text-slate-600">
                  {formatAge(tx.seenAt, now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
