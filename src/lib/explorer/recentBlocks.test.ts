import { expect, it, vi } from "vitest";
import { fetchRecentBlocks, recentBlocksQuery, type BlockSummary } from "./recentBlocks";
import { queryClient } from "../queryClient";

const hash = (n: number) => n.toString(16).padStart(64, "0");
function block(height: number): BlockSummary {
  return { hash: hash(height), height, previous_block: height > 1 ? hash(height-1) : "", time: height*20, slot: height*20, epoch:0, epoch_slot:height*20, tx_count:0,size:100,slot_leader:"pool" };
}
function response(value: unknown) {
  return new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json"}});
}
it("loads twelve recent blocks through two bounded requests", async () => {
  vi.mocked(fetch).mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith("/latest")) return response(block(12));
    if (path.includes("/previous?")) return response(Array.from({length:11},(_,i)=>block(11-i)));
    return response(block(Number.parseInt(path.split("/").at(-1)!,16)));
  });
  const result = await fetchRecentBlocks();
  expect(result.blocks.map(b=>b.height)).toEqual([12,11,10,9,8,7,6,5,4,3,2,1]);
  expect(result.incomplete).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(`/blocks/${hash(12)}/previous?count=11&order=desc`);
});
it("does not join blocks from a competing branch if the indexed page changes", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response(block(12))).mockResolvedValueOnce(response([block(11),{...block(10),hash:hash(1000)}]));
  const result = await fetchRecentBlocks();
  expect(result.blocks.map(b=>b.height)).toEqual([12,11]);
  expect(result.incomplete).toBe(true);
});
it("preserves the last full cached window when the ancestor page refresh fails", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["dingo", "recent-blocks"];
  const previous = { blocks: Array.from({ length: 12 }, (_, i) => block(12-i)), incomplete: false };
  client.setQueryData(key, previous);
  vi.mocked(fetch).mockResolvedValueOnce(response(block(13))).mockRejectedValueOnce(new Error("Ancestor page unavailable"));
  try {
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => fetchRecentBlocks(), staleTime: 0 })).rejects.toThrow("Could not reach Dingo");
    expect(client.getQueryData(key)).toEqual(previous);
  } finally { client.clear(); }
});
it("rejects a parent edge with matching hash but inconsistent height", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response(block(12))).mockResolvedValueOnce(response([{ ...block(11), height: 10 }]));
  const result = await fetchRecentBlocks();
  expect(result.blocks.map((row) => row.height)).toEqual([12]);
  expect(result.incomplete).toBe(true);
});

it.each([404, 503])("keeps an existing recent window when its ancestor endpoint returns %s", async (status) => {
  const previous = { blocks: [block(12)], incomplete: false };
  queryClient.setQueryData(recentBlocksQuery.queryKey, previous);
  vi.mocked(fetch).mockResolvedValueOnce(response(block(13)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Ancestor unavailable" }), { status }));
  try {
    await expect(queryClient.fetchQuery({ ...recentBlocksQuery, retry: false, staleTime: 0 })).rejects.toThrow("Ancestor unavailable");
    expect(queryClient.getQueryData(recentBlocksQuery.queryKey)).toEqual(previous);
  } finally { queryClient.clear(); }
});

it("clears the window when the latest-block endpoint itself returns not found", async () => {
  queryClient.setQueryData(recentBlocksQuery.queryKey, { blocks: [block(12)], incomplete: false });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
  try {
    await expect(queryClient.fetchQuery({ ...recentBlocksQuery, retry: false, staleTime: 0 })).rejects.toThrow("Not found");
    expect(queryClient.getQueryData(recentBlocksQuery.queryKey)).toBeUndefined();
  } finally { queryClient.clear(); }
});
