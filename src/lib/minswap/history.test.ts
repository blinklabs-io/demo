// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockfrostFetch } from "../dingo/blockfrost";
import { authenticatePool } from "./data";
import { poolFixtures } from "./fixtures";
import { readMinswapHistory } from "./history";
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("./read", () => ({ assertMinswapGenesis: vi.fn() }));
const fetch = vi.mocked(blockfrostFetch);
const hour = 3600000;
const now = Date.UTC(2026, 10, 5, 12);
const pool = authenticatePool(poolFixtures[1]);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe("Dingo-backed pool price history", () => {
  it("uses a currently unspent reserve state only from its creation time", async () => {
    fetch.mockImplementation(async (path) => {
      if (path === `/api/v0/txs/${pool.txHash}`)
        return {
          hash: pool.txHash,
          block_time: (now - 12 * hour) / 1000,
        } as never;
      return [] as never;
    });
    const result = await readMinswapHistory(pool);
    expect(result.points.map((p) => p.time)).toEqual([
      now - 12 * hour,
      now - 6 * hour,
      now,
    ]);
    expect(
      result.points.every(
        (p) => p.value === Number(pool.reserveB) / Number(pool.reserveA),
      ),
    ).toBe(true);
    expect(result.partial).toBe(true);
  });
  it("does not turn unrelated LP transfers into historical pool prices", async () => {
    const transfer = "ab".repeat(32);
    fetch.mockImplementation(async (path) => {
      if (path === `/api/v0/txs/${pool.txHash}`)
        return { hash: pool.txHash, block_time: now / 1000 } as never;
      if (path.includes("/assets/"))
        return [
          { tx_hash: transfer, block_time: (now - 8 * 24 * hour) / 1000 },
        ] as never;
      return { hash: transfer, outputs: [] } as never;
    });
    expect((await readMinswapHistory(pool)).points).toEqual([
      { time: now, value: Number(pool.reserveB) / Number(pool.reserveA) },
    ]);
  });
  it("caps an active asset's transaction directory at five pages", async () => {
    fetch.mockImplementation(async (path) => {
      if (path === `/api/v0/txs/${pool.txHash}`)
        return {
          hash: pool.txHash,
          block_time: now / 1000,
        } as never;
      if (!path.includes("/assets/"))
        return { hash: "00".repeat(32), outputs: [] } as never;
      return Array.from({ length: 100 }, (_, i) => ({
        tx_hash: i.toString(16).padStart(64, "0"),
        block_time: (now - hour) / 1000,
      })) as never;
    });
    const result = await readMinswapHistory(pool);
    expect(
      fetch.mock.calls.filter(([path]) => path.includes("/assets/")),
    ).toHaveLength(5);
    expect(result.points).toHaveLength(1);
    expect(result.partial).toBe(true);
  });
});

it("does not query LP transfers when the unspent state covers the whole week", async () => {
  fetch.mockImplementation(async (path) =>
    path.includes("/assets/")
      ? ([] as never)
      : ({
          hash: pool.txHash,
          block_time: (now - 8 * 24 * hour) / 1000,
        } as never),
  );
  const result = await readMinswapHistory(pool);
  expect(result.points).toHaveLength(29);
  expect(result.partial).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});
