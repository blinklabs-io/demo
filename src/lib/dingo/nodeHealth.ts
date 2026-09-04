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

interface NetworkEraBound {
  time: number;
  slot: number;
  epoch: number;
}

interface NetworkEraResponse {
  start: NetworkEraBound;
  end: NetworkEraBound | null;
}

export interface NodeHealth {
  isHealthy: boolean;
  tipHeight: number;
  tipSlot: number;
  tipEpoch: number;
  tipHash: string;
  secondsSinceTip: number;
  eraIndex: number;
}

async function fetchNodeHealth(): Promise<NodeHealth> {
  const [health, latestBlock, eras] = await Promise.all([
    blockfrostFetch<HealthResponse>("/health"),
    blockfrostFetch<BlockResponse>("/api/v0/blocks/latest"),
    blockfrostFetch<NetworkEraResponse[]>("/api/v0/network/eras"),
  ]);

  // The array is ordered oldest to newest; the current era is whichever entry
  // has no end boundary yet, falling back to the last entry Dingo reports.
  const currentEraIndex = eras.findIndex((era) => era.end === null);

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
    eraIndex: Math.max(
      0,
      currentEraIndex >= 0 ? currentEraIndex : eras.length - 1,
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
