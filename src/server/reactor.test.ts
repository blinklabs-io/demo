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
  expect(fetch).toHaveBeenCalledWith("https://web-api-bridge.ethernal.tech/settings", expect.objectContaining({ credentials: "omit", redirect: "manual" }));
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

it("uses the redirect mode supported by Workers and rejects redirect responses", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    if (options?.redirect === "error") throw new TypeError("Workers does not support redirect error mode");
    return Response.json({ enabledChains: ["prime"] });
  });
  expect((await reactor(request("resource=settings"))).status).toBe(200);
  fetch.mockImplementation(async () => new Response("", { status: 302, headers: { Location: "https://other.example" } }));
  expect((await reactor(request("resource=settings"))).status).toBe(502);
});

it("relays transfer data and distinguishes transport and decoding failures", async () => {
  const hash = "ab".repeat(32), data = { sourceTxHash: hash, status: "SubmittedToBridge" };
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(data));
  expect(await (await reactor(request("resource=transfer&hash=" + hash))).json()).toEqual(data);
  expect(fetch.mock.calls[0][0]).toBe("https://web-api-bridge.ethernal.tech/bridgeTransaction/byTxHash/prime/" + hash);
  fetch.mockRejectedValue(new Error("Connection failed"));
  expect((await reactor(request("resource=settings"))).status).toBe(502);
  fetch.mockResolvedValue(new Response("invalid json"));
  expect((await reactor(request("resource=settings"))).status).toBe(502);
  const unsupported = await reactor(new Request("https://demo.example/reactor", { method: "POST" }));
  expect(unsupported.headers.get("Allow")).toBe("GET");
});
