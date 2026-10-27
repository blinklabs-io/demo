import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import { readEpochBalanceHistory } from "./balanceHistory";

vi.mock("./blockfrost", async (original) => ({
  ...(await original<typeof import("./blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
const hashes = ["11", "22", "33", "44"].map((byte) => byte.repeat(32));
const block = (epoch: number) => ({
  hash: hashes[epoch],
  height: epoch * 10,
  time: 1700000000 + epoch * 86400,
  epoch,
});
let missing: Set<number>;
let fail: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  missing = new Set([0]);
  fail = false;
  vi.mocked(blockfrostFetch).mockImplementation(async (path) => {
    if (path === "/api/v0/blocks/latest") return block(3);
    const match = /epochs\/(\d+)\/blocks/.exec(path);
    if (match) {
      if (fail) throw new BlockfrostError("Backend unavailable", 503, path);
      const epoch = Number(match[1]);
      if (missing.has(epoch))
        throw new BlockfrostError("History not retained", 404, path);
      return [hashes[epoch]];
    }
    return block(hashes.indexOf(path.split("/").at(-1)!));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          block_identifier: body.block_identifier,
          balances: [
            {
              value: body.block_identifier.index === 10 ? "0" : "900000",
              currency: { symbol: "ADA", decimals: 6 },
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("epoch balance history", () => {
  it("reports unretained epochs while preserving real zero and fractional balances", async () => {
    const result = await readEpochBalanceHistory("address");
    expect(result.unavailableEpochs).toEqual([0]);
    expect(result.points.map((point) => point.value)).toEqual([0, 0.9, 0.9]);
    expect(result.points[0].displayValue).toBe("0.00 ADA");
    expect(result.points[1].displayValue).toBe("0.90 ADA");
    expect(result.points[2].label).toBe("Epoch 3 · current");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
        .block_identifier,
    ).toEqual({ index: 10, hash: hashes[1] });
  });
  it("does not manufacture historical zeroes when only the current snapshot is available", async () => {
    missing = new Set([0, 1, 2]);
    const result = await readEpochBalanceHistory("address");
    expect(result.unavailableEpochs).toEqual([0, 1, 2]);
    expect(result.points).toHaveLength(1);
  });
  it("propagates service failures instead of labeling them as missing history", async () => {
    fail = true;
    await expect(readEpochBalanceHistory("address")).rejects.toThrow(
      "Backend unavailable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects historical balances for a different block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              block_identifier: { index: 10, hash: hashes[3] },
              balances: [],
            }),
          ),
      ),
    );
    await expect(readEpochBalanceHistory("address")).rejects.toThrow(
      "different historical block",
    );
  });
});
