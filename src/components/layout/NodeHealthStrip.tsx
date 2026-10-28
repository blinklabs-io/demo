import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { networkName } from "../../lib/dingo/networkNames";
import { EraName } from "../explorer/EraName";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { useTipStore } from "../../stores/tipStore";
import { useNow } from "../../lib/useNow";

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function NodeHealthStrip() {
  const { data, isError, isLoading } = useNodeHealth();
  const liveTip = useTipStore((state) => state.tip);
  const tipStatus = useTipStore((state) => state.status);
  const now = useNow();
  const genesis = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ network_magic: number }>("/api/v0/genesis", { signal }),
    staleTime: Infinity,
  });

  if (isLoading) {
    return <span className="text-slate-500">Connecting to Dingo…</span>;
  }

  if (isError || !data) {
    return (
      <span className="flex items-center gap-1.5 text-red-400">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Dingo unreachable
      </span>
    );
  }

  const usingLiveTip = tipStatus === "live" && liveTip !== null;
  const tipHeight = usingLiveTip ? liveTip.height : data.tipHeight;
  const secondsSinceTip = usingLiveTip
    ? Math.max(0, Math.floor((now - liveTip.receivedAt) / 1000))
    : data.secondsSinceTip;

  return (
    <span className="flex items-center gap-3 text-slate-400">
      <span
        title={
          genesis.data
            ? `Network magic ${genesis.data.network_magic}`
            : genesis.error?.message
        }
      >
        {genesis.data
          ? networkName(genesis.data.network_magic)
          : genesis.isLoading
            ? "Identifying network…"
            : "Network unavailable"}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${data.isHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {data.isHealthy ? "Healthy" : "Unhealthy"}
      </span>
      <span className="flex items-center gap-1">
        Tip <span className="text-slate-200">#{tipHeight}</span>
        {usingLiveTip && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-sky-400"
            title="Live via FollowTip"
          />
        )}
      </span>
      <span>Epoch {data.tipEpoch}</span>
      <span>
        <EraName epoch={data.tipEpoch} />
      </span>
      <span className="hidden sm:inline">{formatAge(secondsSinceTip)}</span>
    </span>
  );
}
