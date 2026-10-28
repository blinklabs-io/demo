import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { eraNameFromProtocol } from "../../lib/dingo/networkNames";

export function EraName({ epoch }: { epoch?: number }) {
  // Era summaries omit names and can omit earlier eras; list positions are not era IDs.
  const query = useQuery({
    queryKey: ["dingo", "epoch", String(epoch), "parameters"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ protocol_major_ver: number }>(
        `/api/v0/epochs/${epoch}/parameters`,
        { signal },
      ),
    enabled: epoch !== undefined && Number.isSafeInteger(epoch) && epoch >= 0,
    staleTime: Infinity,
    retry: false,
  });
  if (query.isLoading) return <span>Identifying era…</span>;
  if (!query.data)
    return <span title={query.error?.message}>Era unavailable</span>;
  return (
    <span title={`Protocol major version ${query.data.protocol_major_ver}`}>
      {eraNameFromProtocol(query.data.protocol_major_ver)}
    </span>
  );
}
