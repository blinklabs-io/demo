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
}

export interface NodeHealth {
  isHealthy: boolean;
  tipHeight: number;
  tipSlot: number;
  tipEpoch: number;
  tipHash: string;
  secondsSinceTip: number;
}

async function fetchNodeHealth(): Promise<NodeHealth> {
  const [health, latestBlock] = await Promise.all([
    blockfrostFetch<HealthResponse>("/health"),
    blockfrostFetch<BlockResponse>("/api/v0/blocks/latest"),
  ]);

  return {
    isHealthy: health.is_healthy,
    tipHeight: latestBlock.height,
    tipSlot: latestBlock.slot,
    tipEpoch: latestBlock.epoch,
    tipHash: latestBlock.hash,
    secondsSinceTip: Math.max(
      0,
      Math.floor(Date.now() / 1000) - latestBlock.time,
    ),
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
