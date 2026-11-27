import type { CSSProperties } from "react";
import { Link } from "../NetworkLink";
import { RollingNumber } from "../RollingNumber";
import { useMempoolStore } from "../../stores/mempoolStore";
import { useNow } from "../../lib/useNow";
import { BlockHeaderVersion } from "../explorer/BlockHeaderVersion";
import { PoolIdentity } from "../explorer/PoolIdentity";
export interface ConveyorBlock {
  hash: string;
  height: number;
  slot: number;
  size: number;
  tx_count: number;
  slot_leader: string;
  time?: number;
}

function age(seconds: number) {
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function BlockConveyor({ blocks }: { blocks: ConveyorBlock[] }) {
  const pending = useMempoolStore((s) => s.pendingTxs);
  const status = useMempoolStore((s) => s.status);
  const now = useNow(5_000);
  const maximum = Math.max(1, ...blocks.map((b) => b.size));
  const packets = [...pending.values()].slice(0, 18);
  return (
    <section className="chain-conveyor" aria-label="Mempool and recent blocks">
      <div className="conveyor-mempool">
        <span className="eyebrow">
          <i className={status === "live" ? "live" : ""} />
          Mempool
        </span>
        <strong>
          <RollingNumber
            value={status === "live" ? pending.size.toLocaleString() : "—"}
          />
        </strong>
        <span className="conveyor-note">
          {status === "live" ? "pending in Dingo" : `mempool ${status}`}
        </span>
        <div className="pending-particles" aria-label="Pending transactions">
          {packets.map((p) => (
            <Link
              key={p.hash}
              to={`/explorer/tx/${p.hash}`}
              aria-label={`Pending transaction ${p.hash}, ${p.outputCount} outputs`}
              title={`${p.hash} · ${p.outputCount} outputs · pending`}
            />
          ))}
        </div>
        <Link to="/explorer/mempool">Open mempool</Link>
      </div>
      <div
        className="conveyor-track"
        tabIndex={0}
        aria-label="Recent confirmed blocks; scroll to explore"
      >
        {blocks.slice(0, 8).map((b, i) => (
          <article
            className={`conveyor-block${i === 0 ? " newest" : ""}`}
            key={b.hash}
          >
            <Link
              className="conveyor-block-body"
              to={`/explorer/block/${b.hash}`}
              aria-label={`Block ${b.height}, ${b.tx_count} transactions, ${b.size} bytes`}
            >
              <strong>#{b.height.toLocaleString()}</strong>
              <span className="conveyor-note">
                {i === 0 ? "Chain tip" : null}
                {i === 0 && b.time !== undefined ? " · " : null}
                {b.time !== undefined
                  ? age(Math.max(0, Math.floor(now / 1000) - b.time))
                  : null}
              </span>
              <span
                className="block-well"
                aria-hidden="true"
                style={
                  {
                    "--fill": `${Math.max(3, (100 * b.size) / maximum)}%`,
                  } as CSSProperties
                }
              >
                <i />
              </span>
              <span className="conveyor-figures">
                <span>{(b.size / 1024).toFixed(1)} KiB</span>
                <span>{b.tx_count} tx</span>
              </span>
            </Link>
            <div className="conveyor-producer">
              <PoolIdentity poolId={b.slot_leader} compact copyable={false} />
              <BlockHeaderVersion hash={b.hash} slot={b.slot} />
            </div>
          </article>
        ))}
      </div>
      <p className="conveyor-footnote">
        Bars compare block size within these {Math.min(8, blocks.length)}{" "}
        blocks. A transaction leaving the mempool does not prove it was
        included.
      </p>
    </section>
  );
}
