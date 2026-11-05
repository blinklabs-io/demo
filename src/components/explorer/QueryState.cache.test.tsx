import { afterEach, expect, it } from "vitest";
import { queryClient } from "../../lib/queryClient";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

afterEach(() => queryClient.clear());
it("does not resurrect a successful entity after 404 followed by a transient failure", async () => {
  const key = ["dingo", "tx", "orphan"];
  await queryClient.fetchQuery({ queryKey: key, queryFn: async () => ({ confirmed: true }) });
  const missing = new BlockfrostError("Gone", 404, "/tx/orphan");
  await expect(queryClient.fetchQuery({ queryKey: key, staleTime: 0, retry: false, queryFn: async () => { throw missing; } })).rejects.toBe(missing);
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryState(key)?.error).toBe(missing);
  expect(queryClient.getQueryState(key)?.status).toBe("error");
  const unavailable = new BlockfrostError("Unavailable", 500, "/tx/orphan");
  await expect(queryClient.fetchQuery({ queryKey: key, staleTime: 0, retry: false, queryFn: async () => { throw unavailable; } })).rejects.toBe(unavailable);
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryState(key)?.error).toBe(unavailable);
  await queryClient.fetchQuery({ queryKey: key, queryFn: async () => ({ confirmed: true, block: "new" }) });
  expect(queryClient.getQueryData(key)).toEqual({ confirmed: true, block: "new" });
});
