import { queryOptions } from "@tanstack/react-query";
import { blockfrostFetch } from "../dingo/blockfrost";

export interface BlockSummary {
  time: number;
  height: number;
  hash: string;
  slot: number;
  epoch: number;
  epoch_slot: number;
  tx_count: number;
  size: number;
  previous_block: string;
  slot_leader: string;
}
export async function fetchRecentBlocks(signal?: AbortSignal) {
  const latest = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest", { signal });
  const blocks = [latest];
  if (!latest.previous_block) return { blocks, incomplete: false };
  let previous: BlockSummary[];
  try {
    previous = await blockfrostFetch<BlockSummary[]>(
      `/api/v0/blocks/${latest.hash}/previous?count=11&order=desc`, { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    // A missing ancestor page does not establish that the latest block is gone.
    throw new Error(`Could not refresh recent block history: ${error instanceof Error ? error.message : "Request failed"}`, { cause: error });
  }
  for (const block of previous) {
    const parent = blocks.at(-1)!;
    if (block.hash !== parent.previous_block || block.height !== parent.height - 1)
      return { blocks, incomplete: true };
    blocks.push(block);
  }
  return { blocks, incomplete: blocks.length < 12 && Boolean(blocks.at(-1)!.previous_block) };
}

export const recentBlocksQuery = queryOptions({
  queryKey: ["dingo", "recent-blocks"],
  queryFn: async ({ signal, client }) => {
    const result = await fetchRecentBlocks(signal);
    const cached = client.getQueryData<typeof result>(["dingo", "recent-blocks"]);
    if (result.incomplete && cached && !cached.incomplete)
      throw new Error("Could not refresh recent blocks.");
    return result;
  },
});
