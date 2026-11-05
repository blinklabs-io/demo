import { queryOptions, useQuery } from "@tanstack/react-query";
import { loadKernelPage } from "../../lib/kernel/markets";
import type { KernelLane } from "../../lib/kernel/protocol";
export type KernelSelection = {
  lane: KernelLane;
  cursor: string;
  outpoint: string;
};
export function kernelPageQuery(lane: KernelLane, cursor: string) {
  return queryOptions({
    queryKey: ["dingo", "markets", "kernel", lane, cursor],
    queryFn: ({ signal }) => loadKernelPage(lane, cursor, signal),
    staleTime: 30000,
    retry: false,
  });
}
export function useKernelSelection(selection?: KernelSelection) {
  const page = useQuery({
    ...kernelPageQuery(
      selection?.lane ?? "loan-negotiation",
      selection?.cursor ?? "",
    ),
    enabled: false,
  });
  return {
    record: selection
      ? page.data?.records.find(
          (record) => record.outpoint === selection.outpoint,
        )
      : undefined,
    records: page.data?.records ?? [],
  };
}
