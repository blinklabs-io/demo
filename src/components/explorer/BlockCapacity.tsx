import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { blockBytesQuery } from "../../lib/dingo/blockHeader";
import { blockResourceUsage, decodeBlockResources } from "../../lib/explorer/blockCapacity";
import { QueryState } from "./QueryState";
import { Gauge, Meter } from "./Visuals";

interface Parameters {
  max_block_size: number;
  protocol_major_ver: number;
  max_block_ex_mem: string | null;
  max_block_ex_steps: string | null;
}

export function BlockCapacity({ hash, slot, epoch }: {
  hash: string; slot: number; epoch: number;
}) {
  const parameters = useQuery({
    queryKey: ["dingo", "epoch", String(epoch), "parameters"],
    queryFn: ({ signal }) => blockfrostFetch<Parameters>(`/api/v0/epochs/${epoch}/parameters`, { signal }),
    staleTime: Infinity,
  });
  const units = useQuery({
    ...blockBytesQuery(hash, slot),
    select: decodeBlockResources,
  });
  let usage: ReturnType<typeof blockResourceUsage> | undefined;
  let error = parameters.error ?? units.error;
  if (parameters.data && units.data) {
    try {
      const major = parameters.data.protocol_major_ver;
      if (!Number.isSafeInteger(major) || major < 0)
        throw new Error("Dingo did not return a valid protocol version.");
      const limit = (value: string | null) => {
        if (major < 5 && (value === null || value === "0")) return null;
        if (typeof value !== "string" || !/^\d+$/.test(value))
          throw new Error("Dingo did not return valid block execution limits.");
        return BigInt(value);
      };
      usage = blockResourceUsage(units.data.bytes, units.data, {
        bytes: parameters.data.max_block_size,
        memory: limit(parameters.data.max_block_ex_mem),
        steps: limit(parameters.data.max_block_ex_steps),
      });
    } catch (cause) {
      error = cause instanceof Error ? cause : new Error("Block capacity unavailable.");
    }
  }
  return (
    <QueryState hasData={Boolean(usage)} isLoading={parameters.isLoading || units.isLoading} error={error}>
      {usage && <section className="block-capacity" aria-label="Block resource capacity">
        <Gauge label="Block capacity used" value={usage.percent}
          detail={`${usage.percent >= 100 ? "Full" : "Highest utilization"} · ${usage.bottleneck.label.toLowerCase()} · epoch ${epoch}`}
          tone={usage.percent >= 100 ? "red" : "violet"} />
        <div className="block-resource-meters">
          {usage.resources.map((resource) => resource.percent === null
            ? <p key={resource.label} className="text-xs text-slate-400">{resource.label}: not applicable in this epoch.</p>
            : <Meter key={resource.label} label={resource.label} value={resource.percent}
                detail={`${resource.used.toLocaleString()} / ${resource.limit!.toLocaleString()}`} />)}
        </div>
      </section>}
    </QueryState>
  );
}
