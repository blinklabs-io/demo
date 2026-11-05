import { blockfrostFetch } from "./blockfrost";

export async function readDingoChainTime(signal?: AbortSignal) {
  const block = await blockfrostFetch<{ time: number }>(
    "/api/v0/blocks/latest",
    { signal },
  );
  if (
    !Number.isSafeInteger(block.time) ||
    block.time < 0 ||
    !Number.isSafeInteger(block.time * 1000)
  )
    throw new Error("Dingo returned invalid chain time.");
  return block.time * 1000;
}
