import type { BlockSummary } from "../../lib/explorer/recentBlocks";
import "./block-activity-strip.css";

export function BlockActivityStrip({
  blocks,
  selectedHash,
  onSelect,
}: {
  blocks: BlockSummary[];
  selectedHash?: string;
  onSelect: (block: BlockSummary) => void;
}) {
  if (!blocks.length) return null;
  const chronological = [...blocks].reverse();
  const peak = Math.max(1, ...blocks.map((block) => block.tx_count));
  return (
    <section
      className="block-activity-strip"
      aria-label="Choose a recent block to inspect"
    >
      <header>
        <span className="eyebrow">
          Recent activity · transactions per block
        </span>
        <span>{blocks.length} blocks · oldest → newest</span>
      </header>
      <div className="block-activity-skyline">
        {chronological.map((block) => (
          <button
            key={block.hash}
            type="button"
            aria-pressed={selectedHash === block.hash}
            aria-label={`Inspect block ${block.height.toLocaleString()}, ${block.tx_count.toLocaleString()} transactions`}
            title={`Block #${block.height.toLocaleString()} · ${block.tx_count.toLocaleString()} transactions · ${(block.size / 1024).toFixed(1)} KiB`}
            onClick={() => onSelect(block)}
          >
            <span className="block-activity-count">{block.tx_count}</span>
            <span className="block-activity-track" aria-hidden="true">
              <i style={{ height: `${(100 * block.tx_count) / peak}%` }} />
            </span>
            <span className="block-activity-height">
              #{block.height.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <p>
        Select a column to explore its transaction mosaic. Heights compare
        transaction counts within this window.
      </p>
    </section>
  );
}
