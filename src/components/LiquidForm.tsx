import { useEffect, useRef, useState } from "react";
import { createLiquidForm, type LiquidShape } from "../lib/chain/liquidForm";
import { canUseWebGL } from "../lib/chain/webgl";

/** One solid per section, each polished to reflect the accent and that section's hue. */
const shapes: Record<string, LiquidShape> = {
  explore: "ring",
  participate: "knot",
  swap: "liquid",
  build: "block",
  wallet: "coin",
};

/** Decorative: floats behind the page. Renders nothing for sections without a shape. */
export default function LiquidForm({ area }: { area: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [supported] = useState(canUseWebGL);
  const shape = shapes[area];
  useEffect(() => {
    if (!canvas.current || !supported || !shape) return;
    const form = createLiquidForm(canvas.current, {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      tokens: ["--accent", "--area"],
      shape,
    });
    return () => form.dispose();
  }, [supported, shape]);
  if (!supported || !shape) return null;
  return <canvas key={shape} ref={canvas} className="liquid-form" aria-hidden="true" />;
}
