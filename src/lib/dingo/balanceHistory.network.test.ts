import { expect, it, vi } from "vitest";
import { readEpochBalanceHistory } from "./balanceHistory";
vi.mock("./config", () => ({ DINGO_NETWORK: { id: "preprod" }, DINGO_CONFIG: { meshUrl: "https://mesh.invalid" } }));
vi.mock("./blockfrost", async (original) => ({
  ...await original<typeof import("./blockfrost")>(),
  blockfrostFetch: async () => ({ hash: "11".repeat(32), height: 10, time: 1700000000, epoch: 0 }),
}));
it("requests Rosetta history using the selected Preprod network identifier", async () => {
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    const request = JSON.parse(options!.body as string);
    expect(request.network_identifier).toEqual({ blockchain: "cardano", network: "preprod" });
    return new Response(JSON.stringify({ block_identifier: request.block_identifier, balances: [{ value: "1000000", currency: { symbol: "ADA", decimals: 6 } }] }));
  });
  const history = await readEpochBalanceHistory("address");
  expect(history.points[0].value).toBe(1);
});
