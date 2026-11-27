import { useEffect, useRef, useState } from "react";
import { createEpochRing } from "../../lib/chain/epochRing";
import { canUseWebGL } from "../../lib/chain/webgl";

/** Decorative: the epoch meter beside it carries the same value for readers. */
export default function EpochRing({ progress }: { progress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<ReturnType<typeof createEpochRing> | null>(null);
  const [supported] = useState(canUseWebGL);

  useEffect(() => {
    if (!canvas.current || !supported) return;
    ring.current = createEpochRing(canvas.current, {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    return () => {
      ring.current?.dispose();
      ring.current = null;
    };
  }, [supported]);
  useEffect(() => {
    ring.current?.setProgress(progress);
  }, [progress, supported]);

  if (!supported) return null;
  return <canvas ref={canvas} className="epoch-ring" aria-hidden="true" />;
}
