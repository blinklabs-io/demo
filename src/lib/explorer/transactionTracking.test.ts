import { afterEach, expect, it, vi } from "vitest";
import { readTrackingSnapshot, trackingVerdict } from "./transactionTracking";
import { blockfrostFetch, BlockfrostError } from "../dingo/blockfrost";
vi.mock("../dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const hash = "11".repeat(32),
  block = "22".repeat(32);
const tip = { height: 100, slot: 1000, hash: block };
const inclusion = {
  hash,
  block,
  block_height: 100,
  block_time: 1700000000,
  valid_contract: true,
};

it("re-reads indexed inclusion and drops it after rollback", async () => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce(tip)
    .mockResolvedValueOnce(inclusion)
    .mockResolvedValueOnce({ height: 100, hash: block, confirmations: 0 });
  expect((await readTrackingSnapshot(hash)).inclusion).toEqual(inclusion);
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ ...tip, height: 99, hash: "44".repeat(32) })
    .mockRejectedValueOnce(new BlockfrostError("Not found", 404, ""));
  const next = await readTrackingSnapshot(hash);
  expect(next.inclusion).toBeNull();
  expect(next.tip).toEqual({ ...tip, height: 99, hash: "44".repeat(32) });
  expect(next.depth).toBeNull();
  expect(trackingVerdict(next, false)).toBe("Awaiting chain evidence");
});

it("does not confuse an API failure with absent inclusion or rejection", async () => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce(tip)
    .mockRejectedValueOnce(new BlockfrostError("Unavailable", 503, ""));
  await expect(readTrackingSnapshot(hash)).rejects.toMatchObject({
    status: 503,
  });
});

it.each([
  { ...inclusion, hash: "33".repeat(32) },
  { ...inclusion, valid_contract: undefined },
  { ...inclusion, block_height: -1 },
  { ...inclusion, block: "invalid" },
])("rejects invalid inclusion evidence", async (record) => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce(tip)
    .mockResolvedValueOnce(record);
  await expect(readTrackingSnapshot(hash)).rejects.toThrow(/invalid inclusion/);
});

it("treats expiry as an exclusive upper bound while preserving earlier inclusion and script failure", () => {
  const snapshot = { tip, inclusion: null };
  expect(trackingVerdict(snapshot, true, 1001)).toBe("Observed in mempool");
  expect(trackingVerdict(snapshot, true, 1000)).toBe("Validity window ended");
  expect(trackingVerdict(snapshot, false, 999)).toBe("Validity window ended");
  expect(trackingVerdict({ tip, inclusion }, false, 999)).toBe(
    "Included on chain",
  );
  expect(
    trackingVerdict(
      { tip, inclusion: { ...inclusion, valid_contract: false } },
      false,
    ),
  ).toBe("Script validation failed");
});

it("refuses confirmations for an indexed transaction on a different canonical block", async () => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ ...tip, height: 105, hash: "44".repeat(32) })
    .mockResolvedValueOnce(inclusion)
    .mockResolvedValueOnce({
      height: 100,
      hash: "33".repeat(32),
      confirmations: 5,
    });
  await expect(readTrackingSnapshot(hash)).rejects.toThrow(/canonical/);
});
