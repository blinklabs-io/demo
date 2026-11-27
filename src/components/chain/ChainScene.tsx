import { useEffect, useId, useRef, useState } from "react";
import { Link } from "../NetworkLink";
import { createChainScene, type ChainBlock } from "../../lib/chain/chainScene";
import "./chain-scene.css";
import { canUseWebGL } from "../../lib/chain/webgl";

const describe = (block: ChainBlock) =>
  `${block.tx_count.toLocaleString()} ${block.tx_count === 1 ? "transaction" : "transactions"}, ${(block.size / 1024).toFixed(1)} KB`;

/** Newest block first, as returned by the recent-blocks query. */
export default function ChainScene({ blocks }: { blocks: ChainBlock[] }) {
  const caption = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const links = useRef<HTMLOListElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createChainScene> | null>(null);
  const [hover, setHover] = useState<{ block: ChainBlock; x: number; y: number } | null>(null);
  // Without WebGL the block links below carry the same information.
  const [failed] = useState(() => !canUseWebGL());

  useEffect(() => {
    if (!canvas.current || !callout.current || failed) return;
    scene.current = createChainScene(canvas.current, {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      callout: callout.current,
      onHover: (block, x, y) => setHover(block ? { block, x, y } : null),
      onSelect: (block) =>
        links.current
          ?.querySelector<HTMLAnchorElement>(`[data-hash="${block.hash}"]`)
          ?.click(),
    });
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [failed]);
  useEffect(() => {
    scene.current?.setBlocks(blocks);
  }, [blocks]);
  // The scene answers the reader's scroll: nothing moves on its own.
  useEffect(() => {
    if (failed) return;
    const onScroll = () => scene.current?.setProgress(window.scrollY / 360);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [failed]);

  const largest = blocks
    .filter((block) => block.tx_count > 0)
    .reduce<ChainBlock | null>(
      (top, block) => (!top || block.size > top.size ? block : top),
      null,
    );

  return (
    <div
      className="chain-scene"
      role="figure"
      aria-labelledby={caption}
      data-fallback={failed || undefined}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <div ref={callout} className="chain-scene-callout" aria-hidden="true">
        {largest && (
          <p>
            <span>Largest of the last {blocks.length}</span>
            <strong>#{largest.height.toLocaleString()}</strong>
            <span>
              {(largest.size / 1024).toFixed(1)} KB ·{" "}
              {largest.tx_count.toLocaleString()} tx
            </span>
          </p>
        )}
      </div>
      <div
        className="chain-scene-tip"
        data-open={hover !== null || undefined}
        style={hover ? { left: hover.x, top: hover.y } : undefined}
      >
        {hover && (
          <>
            <strong>#{hover.block.height.toLocaleString()}</strong>
            {describe(hover.block)}
          </>
        )}
      </div>
      <ol ref={links} className={failed ? "chain-scene-list" : "sr-only"}>
        {blocks.map((block) => (
          <li key={block.hash}>
            <Link to={`/explorer/block/${block.hash}`} data-hash={block.hash}>
              Block #{block.height.toLocaleString()}, {describe(block)}
            </Link>
          </li>
        ))}
      </ol>
      <p id={caption} className="chain-scene-caption">
        The last {blocks.length} blocks, newest in teal, busier ones tinted. Height is block size,
        each layer is a transaction (up to 10 shown).
      </p>
    </div>
  );
}
