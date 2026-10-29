import { useState } from "react";
import { Link } from "react-router";
import { useMempoolStore } from "../../stores/mempoolStore";
import { BlockHeaderVersion } from "../explorer/BlockHeaderVersion";
import { PoolIdentity } from "../explorer/PoolIdentity";
export interface ConveyorBlock {
  hash: string;
  height: number;
  slot: number;
  size: number;
  tx_count: number;
  slot_leader: string;
}
export function BlockConveyor({ blocks }: { blocks: ConveyorBlock[] }) {
  const [paused, setPaused] = useState(false);
  const pending = useMempoolStore((s) => s.pendingTxs);
  const status = useMempoolStore((s) => s.status);
  const maximum = Math.max(1, ...blocks.map((b) => b.size));
  const packets = [...pending.values()].slice(0, 18);
  return (
    <section
      className={`chain-conveyor chain-visual ${paused ? "motion-paused" : ""}`}
      aria-label="Live block conveyor"
    >
      <header className="chain-heading">
        <div>
          <span className="eyebrow">From possibility to permanence</span>
          <h2>The chain is moving.</h2>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume motion" : "Pause motion"}
        </button>
      </header>
      <div className="conveyor-pending">
        <div>
          <span
            className={`conveyor-signal ${status === "live" ? "live" : ""}`}
          />
          <strong>
            {status === "live" ? pending.size.toLocaleString() : "—"}
          </strong>
          <span>
            {status === "live" ? "pending in Dingo" : "mempool " + status}
          </span>
        </div>
        <div className="pending-particles" aria-label="Pending transactions">
          {packets.map((p, i) => (
            <Link
              key={p.hash}
              to={`/explorer/tx/${p.hash}`}
              style={{
                animationDelay: `${-i * 0.4}s`,
                width: Math.min(34, 14 + p.outputCount * 2),
                height: Math.min(34, 14 + p.outputCount * 2),
              }}
              aria-label={`Pending transaction ${p.hash}, ${p.outputCount} outputs`}
              title={`${p.hash} · pending`}
            />
          ))}
          {status === "live" && !packets.length && (
            <span className="chain-muted">
              Waiting for the next transaction
            </span>
          )}
        </div>
        <Link to="/explorer/mempool" className="chain-link">
          Open mempool ↗
        </Link>
      </div>
      <div className="conveyor-separator">
        <span />
        <b>CONFIRMED BLOCKS</b>
        <span />
      </div>
      <div
        className="conveyor-track"
        tabIndex={0}
        aria-label="Recent confirmed blocks; scroll to explore"
      >
        {blocks.slice(0, 8).map((b, i) => (
          <article
            className={`conveyor-block ${i === 0 ? "newest" : ""}`}
            key={b.hash}
          >
            <Link
              className="conveyor-block-body"
              to={`/explorer/block/${b.hash}`}
              aria-label={`Block ${b.height}, ${b.tx_count} transactions, ${b.size} bytes`}
            >
              <span
                className="block-mass"
                style={{ height: 42 + (76 * b.size) / maximum }}
              >
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="eyebrow">
                {i === 0 ? "CHAIN TIP" : `−${i} BLOCKS`}
              </span>
              <strong>#{b.height.toLocaleString()}</strong>
              <span>
                {b.tx_count} tx · {(b.size / 1024).toFixed(1)} KiB
              </span>
            </Link>
            <div className="conveyor-producer">
              <PoolIdentity poolId={b.slot_leader} compact />
              <BlockHeaderVersion hash={b.hash} slot={b.slot} />
            </div>
          </article>
        ))}
      </div>
      <p className="chain-footnote">
        Block columns scale by bytes within this recent window. Pending
        transactions are separate observations; removal from the mempool does
        not prove inclusion.
      </p>
    </section>
  );
}
