import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "./blockfrost";

interface HealthResponse {
  is_healthy: boolean;
}

interface BlockResponse {
  time: number;
  height: number;
  hash: string;
  slot: number;
  epoch: number;
  tx_count: number;
  epoch_slot: number;
}

export interface NodeHealth {
  isHealthy: boolean;
  tipHeight: number;
  tipSlot: number;
  tipEpoch: number;
  tipEpochSlot: number;
  tipHash: string;
  tipTxCount: number;
  tipTime: number;
}

async function fetchNodeHealth({ signal }: { signal: AbortSignal }): Promise<NodeHealth> {
  const [health, latestBlock] = await Promise.all([
    blockfrostFetch<HealthResponse>("/health", { signal }),
    blockfrostFetch<BlockResponse>("/api/v0/blocks/latest", { signal }),
  ]);

  return {
    isHealthy: health.is_healthy,
    tipHeight: latestBlock.height,
    tipSlot: latestBlock.slot,
    tipEpoch: latestBlock.epoch,
    tipEpochSlot: latestBlock.epoch_slot,
    tipHash: latestBlock.hash,
    tipTxCount: latestBlock.tx_count,
    tipTime: latestBlock.time,
  };
}

export function useNodeHealth() {
  return useQuery({
    queryKey: ["dingo", "node-health"],
    queryFn: fetchNodeHealth,
    refetchInterval: 15_000,
    retry: 1,
  });
}
