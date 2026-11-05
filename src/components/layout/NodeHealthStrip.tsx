import { DINGO_NETWORK } from "../../lib/dingo/config";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { networkName } from "../../lib/dingo/networkNames";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { useTipStore } from "../../stores/tipStore";
import { useNow } from "../../lib/useNow";

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function NodeHealthStrip() {
  const { data, dataUpdatedAt, error, isError, isLoading } = useNodeHealth();
  const liveTip = useTipStore((state) => state.tip);
  const tipStatus = useTipStore((state) => state.status);
  const lastAction = useTipStore((state) => state.lastAction);
  const lastEventAt = useTipStore((state) => state.lastEventAt);
  const now = useNow();
  const genesis = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ network_magic: number }>("/api/v0/genesis", { signal }),
    staleTime: Infinity,
  });

  if (
    lastAction !== null && lastAction !== "apply" &&
    lastEventAt !== null && dataUpdatedAt <= lastEventAt
  ) return <span role="status" className="text-amber-300">Reconciling chain…</span>;

  if (isLoading) {
    return <span className="text-slate-500">Connecting to Dingo…</span>;
  }

  if (isError || !data) {
    return (
      <span className="flex items-center gap-1.5 text-red-400">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        {error instanceof BlockfrostError && error.status >= 400
          ? `Dingo API returned ${error.status}`
          : error instanceof BlockfrostError && error.status > 0
            ? "Invalid Dingo response"
            : "Dingo unreachable"}
      </span>
    );
  }

  const usingLiveTip = tipStatus === "live" && liveTip !== null;
  const tipHeight = usingLiveTip ? liveTip.height : data.tipHeight;
  const age = usingLiveTip && liveTip.hash !== data.tipHash
    ? `Observed ${formatAge(Math.max(0, Math.floor((now - liveTip.receivedAt) / 1000)))}`
    : `Block minted ${formatAge(Math.max(0, Math.floor(now / 1000) - data.tipTime))}`;

  return (
    <span
      className="flex flex-wrap items-center gap-3 text-slate-400"
      title={`Tip #${tipHeight} · ${usingLiveTip && liveTip.hash !== data.tipHash ? "Epoch pending refresh" : `Epoch ${data.tipEpoch}`} · ${age}${usingLiveTip ? " · FollowTip connected" : ""}`}
    >
      {!genesis.data && <span role="status" className="text-amber-300">
        {genesis.isLoading ? "Verifying network…" : "Network verification unavailable"}
      </span>}
      {genesis.data && genesis.data.network_magic !== DINGO_NETWORK.networkMagic && (
        <span className="text-red-300" role="alert">API reports {networkName(genesis.data.network_magic)}</span>
      )}
      <span className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${data.isHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {data.isHealthy ? "Healthy" : "Unhealthy"}
      </span>
    </span>
  );
}
