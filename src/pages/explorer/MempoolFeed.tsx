import { Metric, PageIntro } from "../../components/explorer/Visuals";
import { Link } from "../../components/NetworkLink";
import { RollingNumber } from "../../components/RollingNumber";
import { useMempoolStore } from "../../stores/mempoolStore";
import { HashLink } from "../../components/explorer/HashLink";
import { LazyDisclosure } from "../../components/explorer/LazyDisclosure";
import { formatNativeCoin } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { MempoolGraph } from "../../components/explorer/MempoolGraph";
import { useMemo } from "react";

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

  const sorted = useMemo(() => [...pendingTxs.values()].sort((a, b) => b.seenAt - a.seenAt), [pendingTxs]);

  const feed =
    status === "live"
      ? "Connected"
      : status === "error"
        ? "Reconnecting"
        : status === "connecting"
          ? "Connecting"
          : "Not started";

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Mempool"
        detail="Transactions Dingo has seen that are not yet in a block. The list updates as they arrive."
        action={
          <div className="page-actions">
            <Link className="experience-primary" to="/wallet/send">Send a test transaction</Link>
            <Link className="button-secondary" to="/wallet/tools/transactions">Build one without a wallet</Link>
            <Link className="button-secondary" to="/explorer/track">Track a transaction</Link>
          </div>
        }
      />
      <div className="metric-grid">
        <Metric
          label="Pending transactions"
          value={<RollingNumber value={sorted.length.toLocaleString()} />}
        />
        <Metric
          label="Total fees"
          value={
            <RollingNumber
              value={formatNativeCoin(
                sorted.reduce((sum, tx) => sum + tx.fee, 0n),
              )}
            />
          }
        />
        <Metric label="Live feed" value={feed} />
      </div>
      {error && status === "error" && (
        <p className="text-sm text-red-400" role="alert">{error}</p>
      )}
      <MempoolGraph transactions={sorted} status={status} />
      <LazyDisclosure
        className="data-panel mempool-transaction-list"
        title={
          <>
            <h2>Pending transactions</h2>
            <span>{sorted.length.toLocaleString()} transactions</span>
          </>
        }
      >
        <div className="panel-content">
          {sorted.length === 0 ? (
            <p className="panel-empty">
              {status === "live" && !error
                ? "No transactions are waiting. New arrivals appear here automatically."
                : "Waiting for the mempool feed."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th className="num">Inputs</th>
                    <th className="num">Outputs</th>
                    <th className="num">Output value</th>
                    <th className="num">Fee</th>
                    <th className="num">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((tx) => (
                    <tr key={tx.hash}>
                      <td>
                        <HashLink kind="tx" id={tx.hash} />
                      </td>
                      <td className="num">{tx.inputCount}</td>
                      <td className="num">{tx.outputCount}</td>
                      <td className="num">
                        {formatNativeCoin(tx.totalOutputLovelace)}
                      </td>
                      <td className="num">{formatNativeCoin(tx.fee)}</td>
                      <td className="num">{formatAge(tx.seenAt, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </LazyDisclosure>
    </div>
  );
}
