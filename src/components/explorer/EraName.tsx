import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { eraNameFromProtocol } from "../../lib/dingo/networkNames";

export function EraName({ epoch }: { epoch?: number }) {
  // Era summaries omit names and can omit earlier eras; list positions are not era IDs.
  const validEpoch = epoch !== undefined && Number.isSafeInteger(epoch) && epoch >= 0;
  const eras = useQuery({
    queryKey: ["dingo", "network", "eras"],
    queryFn: ({ signal }) => blockfrostFetch<{
      start: { epoch: number };
      end: { epoch: number } | null;
      parameters: { slot_length: number; epoch_length: number };
    }[]>("/api/v0/network/eras", { signal }),
    enabled: validEpoch,
    staleTime: 60_000,
    retry: false,
  });
  const byron = validEpoch && eras.data?.some((era) =>
    era.parameters.slot_length === 20 &&
    era.parameters.epoch_length === 21600 &&
    era.start.epoch <= epoch &&
    (era.end === null || epoch < era.end.epoch),
  );
  const query = useQuery({
    queryKey: ["dingo", "epoch", String(epoch), "parameters"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ protocol_major_ver: number }>(
        `/api/v0/epochs/${epoch}/parameters`,
        { signal },
      ),
    enabled: validEpoch && !byron,
    staleTime: Infinity,
    retry: false,
  });
  if (byron) return <span title="Byron era timing: 20-second slots, 21,600 slots per epoch">Byron</span>;
  if (query.isLoading || eras.isLoading) return <span>Identifying era…</span>;
  if (!query.data)
    return <span title={query.error?.message}>Era unavailable</span>;
  return (
    <span title={`Protocol major version ${query.data.protocol_major_ver}`}>
      {eraNameFromProtocol(query.data.protocol_major_ver)}
    </span>
  );
}
