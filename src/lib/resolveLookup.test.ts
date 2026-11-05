import { beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "./queryClient";
import { isMutableChainQuery } from "./chain/useChainReconciliation";
import { resolveLookup } from "./resolveLookup";

beforeEach(() => queryClient.clear());
const hash = "ab".repeat(32);
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
it("reuses the successful transaction probe as its detail record", async () => {
  const record = { hash, block: "cd".repeat(32) };
  vi.mocked(fetch).mockResolvedValue(response(record));
  expect(await resolveLookup(hash)).toEqual({ kind: "tx" });
  const result = await queryClient.fetchQuery({
    queryKey: ["dingo", "tx", hash],
    queryFn: () => { throw new Error("Duplicate detail fetch"); },
  });
  expect(result).toEqual(record);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("reuses block probes after a transaction miss", async () => {
  const record = { hash, height: 10 };
  vi.mocked(fetch).mockResolvedValueOnce(response({},404)).mockResolvedValueOnce(response(record));
  expect(await resolveLookup(hash)).toEqual({ kind: "block" });
  expect(queryClient.getQueryData(["dingo", "block", hash])).toEqual(record);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not probe other entity kinds after cancellation", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(resolveLookup(hash, abort.signal)).rejects.toThrow(/abort/i);
  expect(fetch).not.toHaveBeenCalled();
});
it("revalidates an inactive probe after uncertain cached records are reset", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ hash }));
  expect(await resolveLookup(hash)).toEqual({ kind: "tx" });
  await queryClient.resetQueries({ predicate: (query) => isMutableChainQuery(query.queryKey, true) });
  expect(queryClient.getQueryData(["dingo", "tx", hash])).toBeUndefined();
  vi.mocked(fetch).mockResolvedValue(response({}, 404));
  expect(await resolveLookup(hash)).toEqual({ kind: "none" });
  expect(fetch).toHaveBeenCalledTimes(4);
});
