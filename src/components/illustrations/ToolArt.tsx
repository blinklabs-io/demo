import { useEffect, useRef, useState } from "react";
import { createToolForms, type ToolFormKind } from "../../lib/chain/toolForms";
import { ProductArt, type ProductArtKind } from "./ProductArt";
import { canUseWebGL } from "../../lib/chain/webgl";

// Every tile shares one renderer; it is made for the first and freed with the last.
let stage: ReturnType<typeof createToolForms> | null = null;
let users = 0;

const drawings: Record<ToolFormKind, ProductArtKind> = {
  transactions: "transactions",
  data: "data",
  batch: "batch",
  utxos: "utxos",
  proof: "proof",
  mint: "mint",
  drep: "participate",
  treasury: "markets",
  track: "track",
  participate: "participate",
  markets: "markets",
  mempool: "mempool",
  network: "network",
  bridge: "bridge",
  leios: "leios",
};

/**
 * A lit, still 3D object for one creation tool. Without WebGL it falls back
 * to the line drawing.
 */
export function ToolArt({ kind }: { kind: ToolFormKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [supported] = useState(canUseWebGL);
  useEffect(() => {
    const target = canvas.current;
    if (!target || !supported) return;
    stage ??= createToolForms(target);
    users++;
    const forms = stage;
    const draw = () => forms.draw(kind, target, 0);
    const sizes = new ResizeObserver(draw);
    sizes.observe(target);
    draw();
    return () => {
      sizes.disconnect();
      if (--users === 0) {
        forms.dispose();
        stage = null;
      }
    };
  }, [kind, supported]);
  if (!supported) return <ProductArt kind={drawings[kind]} />;
  return <canvas ref={canvas} className="product-art tool-art" aria-hidden="true" />;
}
