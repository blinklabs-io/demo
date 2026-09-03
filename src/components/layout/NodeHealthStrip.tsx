import { useNodeHealth } from "../../lib/dingo/nodeHealth";

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function NodeHealthStrip() {
  const { data, isError, isLoading } = useNodeHealth();

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

  return (
    <span className="flex items-center gap-3 text-slate-400">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${data.isHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {data.isHealthy ? "Healthy" : "Unhealthy"}
      </span>
      <span>
        Tip <span className="text-slate-200">#{data.tipHeight}</span>
      </span>
      <span>Epoch {data.tipEpoch}</span>
      <span>Era {data.eraIndex}</span>
      <span className="hidden sm:inline">
        {formatAge(data.secondsSinceTip)}
      </span>
    </span>
  );
}
