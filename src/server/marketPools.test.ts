// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { marketPools } from "./marketPools";
import { parsePopularPools } from "../lib/minswap/popular";
import { MAINNET_MINSWAP_V2 } from "../lib/minswap/mainnet";
const asset = (name: string, verified = true) => ({ currency_symbol: name ? "11".repeat(28) : "", token_name: name, is_verified: verified });
function metric(volume = 10, id = "22", verified = true, verifiedA = true) {
  return { type: "MinswapV2", lp_asset: { currency_symbol: MAINNET_MINSWAP_V2.lpPolicyId, token_name: id.repeat(32) }, asset_a: asset("", verifiedA), asset_b: asset("01", verified), volume_24h: volume };
}
afterEach(() => vi.restoreAllMocks());
it("ranks by actual volume and excludes unverified, inactive, unknown-volume and unsupported pools", () => {
  const rows = [metric(1), metric(100, "33"), metric(0, "44"), metric(500, "55", false), metric(800, "88", true, false), { ...metric(900, "66"), type: "Minswap" }, { ...metric(999, "77"), volume_24h: null }, metric(100, "33")];
  expect(parsePopularPools({ pool_metrics: rows })).toEqual([
    { lpAsset: MAINNET_MINSWAP_V2.lpPolicyId + "33".repeat(32), assetA: "lovelace", assetB: "11".repeat(28) + "01", volumeAda: 100 },
    { lpAsset: MAINNET_MINSWAP_V2.lpPolicyId + "22".repeat(32), assetA: "lovelace", assetB: "11".repeat(28) + "01", volumeAda: 1 },
  ]);
});
it("requests a bounded global ranking and returns only normalized public metrics", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ pool_metrics: [{ ...metric(), secret: "discard" }] }, { headers: { "Set-Cookie": "tracking=yes" } }));
  const response = await marketPools(new Request("https://demo.pages.dev/market-pools"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ pools: parsePopularPools({ pool_metrics: [metric()] }) });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("https://api-mainnet-prod.minswap.org/v1/pools/metrics");
  expect(options).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" });
  expect(JSON.parse(String(options?.body))).toEqual({ limit: 12, only_verified: true, sort_field: "volume_24h", sort_direction: "desc", protocols: ["MinswapV2"], currency: "ada" });
});
it("does not fetch arbitrary URLs and reports failed or oversized analytics without caching", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  expect((await marketPools(new Request("https://demo.pages.dev/market-pools?url=https://elsewhere.org"))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  for (const upstream of [new Response("Error", { status: 503 }), new Response("x".repeat(262145)), Response.json({ pool_metrics: Array.from({ length: 13 }, () => metric()) })]) {
    fetch.mockResolvedValueOnce(upstream);
    const response = await marketPools(new Request("https://demo.pages.dev/market-pools"));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
