// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { reactor } from "./reactor";
afterEach(() => vi.restoreAllMocks());
const request = (search: string) => new Request("https://demo.example/reactor?" + search);
it("forwards only fixed read endpoints without credentials or redirects", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ enabledChains: ["prime"] }));
  const response = await reactor(request("resource=settings"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ enabledChains: ["prime"] });
  expect(fetch).toHaveBeenCalledWith("https://web-api-bridge.ethernal.tech/settings", expect.objectContaining({ credentials: "omit", redirect: "error" }));
  await reactor(request("resource=validators"));
  expect(fetch.mock.calls[1][0]).toBe("https://web-api-bridge.ethernal.tech/settings/validatorChangeStatus");
});
it.each(["resource=transfer&hash=../settings", "resource=settings&url=https://other.example", "resource=settings&resource=validators", "resource=transfer&hash=abc", "resource=build"])("rejects %s without reaching upstream", async (search) => {
  const fetch = vi.spyOn(globalThis, "fetch");
  expect((await reactor(request(search))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("distinguishes an unindexed transfer from an unavailable service", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 404 }));
  const query = "resource=transfer&hash=" + "ab".repeat(32);
  expect((await reactor(request(query))).status).toBe(404);
  fetch.mockImplementation(async () => new Response("", { status: 503 }));
  expect((await reactor(request(query))).status).toBe(502);
  fetch.mockImplementation(async () => new Response("x".repeat(65537)));
  expect((await reactor(request(query))).status).toBe(502);
  expect((await reactor(new Request("https://demo.example/reactor", { method: "POST" }))).status).toBe(405);
});
