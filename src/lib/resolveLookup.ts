import { blockfrostFetch, BlockfrostError } from "./dingo/blockfrost";
import { queryClient } from "./queryClient";

type Resolution = { kind: "tx" | "block" | "asset" | "none" };

export async function resolveLookup(
  hash: string,
  signal?: AbortSignal,
): Promise<Resolution> {
  const candidates = [
    ["tx", `/api/v0/txs/${hash}`],
    ["block", `/api/v0/blocks/${hash}`],
    ["asset", `/api/v0/assets/${hash}`],
  ] as const;
  for (const [kind, path] of candidates) {
    try {
      await queryClient.fetchQuery({
        queryKey: ["dingo", kind, hash],
        queryFn: () => blockfrostFetch(path, { signal }),
        retry: false,
      });
      return { kind };
    } catch (error) {
      if (!(error instanceof BlockfrostError) || error.status !== 404)
        throw error;
    }
  }
  return { kind: "none" };
}
