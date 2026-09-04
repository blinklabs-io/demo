import { DINGO_CONFIG } from "../../lib/dingo/config";
import type { BlockfrostError } from "../../lib/dingo/blockfrost";

export function ConnectDingoBanner({ error }: { error: BlockfrostError }) {
  return (
    <div className="border-b border-red-900 bg-red-950 px-4 py-2 text-sm text-red-200">
      <span className="font-medium">Can't reach Dingo</span> at{" "}
      <code className="rounded bg-red-900/60 px-1 py-0.5">
        {DINGO_CONFIG.blockfrostUrl}
      </code>
      . {error.message} Enable CORS for this origin and the Blockfrost API port
      in <code className="rounded bg-red-900/60 px-1 py-0.5">dingo.yaml</code>.
    </div>
  );
}
