import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { recentBlocksQuery } from "../../lib/explorer/recentBlocks";
import { Link } from "../NetworkLink";
import { BlockCapacity } from "./BlockCapacity";
import { QueryState } from "./QueryState";
import "./CapacityCockpit.css";

export function CapacityCockpit() {
  const [selection, setSelection] = useState<string | null>(null);
  const recent = useQuery({
    ...recentBlocksQuery,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const blocks = recent.data?.blocks ?? [];
  const selected =
    blocks.find((block) => block.hash === selection) ?? blocks[0];
  const largest = Math.max(1, ...blocks.map((block) => block.size));
  return (
    <section
      className="capacity-cockpit"
      aria-labelledby="capacity-cockpit-title"
    >
      <header className="capacity-heading">
        <div>
          <span className="eyebrow">Three resources. One block.</span>
          <h2 id="capacity-cockpit-title">What fills a block?</h2>
          <p>
            Bytes, execution memory or steps: the first resource to reach its
            limit makes the block full.
          </p>
        </div>
        <button
          disabled={recent.isFetching}
          onClick={() => void recent.refetch()}
        >
          {recent.isFetching ? "Refreshing…" : "Refresh blocks ↻"}
        </button>
      </header>
      <QueryState
        hasData={Boolean(selected)}
        isLoading={recent.isPending}
        error={recent.error}
      >
        {selected && (
          <>
            <div className="capacity-selection">
              <div>
                <span className="eyebrow">
                  {selected.hash === blocks[0].hash
                    ? "Latest block"
                    : "Selected block"}
                </span>
                <strong>#{selected.height.toLocaleString()}</strong>
              </div>
              <span>
                {selected.tx_count.toLocaleString()} transactions ·{" "}
                {new Date(selected.time * 1000).toLocaleTimeString()}
              </span>
              <Link to={`/explorer/block/${selected.hash}`}>
                Explore block →
              </Link>
            </div>
            <BlockCapacity
              hash={selected.hash}
              slot={selected.slot}
              epoch={selected.epoch}
              variant="gauges"
            />
            <div className="capacity-history-heading">
              <strong>Recent block sizes</strong>
              <span>Oldest → newest · {blocks.length} loaded blocks</span>
            </div>
            <div
              className="capacity-history"
              aria-label="Select a recent block to inspect its capacity"
            >
              {[...blocks].reverse().map((block) => {
                const weight = block.size / largest;
                return (
                  <button
                    key={block.hash}
                    aria-pressed={block.hash === selected.hash}
                    aria-label={`Block ${block.height}, ${block.size.toLocaleString()} serialized bytes, ${block.tx_count} transactions`}
                    title={`#${block.height.toLocaleString()} · ${(block.size / 1024).toFixed(1)} KiB · ${block.tx_count} transactions`}
                    onClick={() => setSelection(block.hash)}
                  >
                    <span
                      className="capacity-history-bar"
                      style={{
                        height: `${Math.max(3, weight * 100)}%`,
                        opacity: 0.4 + weight * 0.6,
                      }}
                    />
                    <span className="capacity-history-height">
                      {block.height.toString().slice(-4)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="capacity-history-scale">
              <span>0</span>
              <span>
                Largest loaded block · {(largest / 1024).toFixed(1)} KiB
              </span>
            </div>
            <p className="capacity-footnote">
              Bars show serialized block size, including its header. Select a
              block for its exact body-byte and declared execution-budget
              utilization above.
            </p>
            {recent.data?.incomplete && (
              <p role="status" className="capacity-footnote">
                The recent block sequence is incomplete. Showing the connected
                blocks Dingo returned.
              </p>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
