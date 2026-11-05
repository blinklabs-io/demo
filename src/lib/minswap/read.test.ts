import { beforeEach, expect, it, vi } from "vitest";
import { readMinswapPools, readLiquidityPositions } from "./read";
import { authenticatePool } from "./data";
import { poolFixtures } from "./fixtures";
import { blockfrostFetch } from "../dingo/blockfrost";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "preprod" } }));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it("loads a bounded manual pool page and rejects unsupported records individually", async () => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce([
      ...poolFixtures,
      { ...poolFixtures[0], inline_datum: "d87a80" },
    ]);
  const result = await readMinswapPools(2);
  expect(result.pools).toHaveLength(2);
  expect(result.errors).toHaveLength(1);
  expect(result.partial).toBe(false);
  expect(vi.mocked(blockfrostFetch).mock.calls[1][0]).toContain(
    "count=20&page=2",
  );
  expect(blockfrostFetch).toHaveBeenCalledTimes(2);
});
it("refuses a wrong-chain response before reading any pools", async () => {
  vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 2 });
  await expect(readMinswapPools()).rejects.toThrow("verified Preprod");
  expect(blockfrostFetch).toHaveBeenCalledTimes(1);
});
it("resolves wallet liquidity holdings by LP asset without scanning the pool catalog", async () => {
  const pool = authenticatePool(poolFixtures[0]);
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce([poolFixtures[0]]);
  const result = await readLiquidityPositions([
    { assetId: pool.lpAsset, quantity: 100n },
  ]);
  expect(result.positions).toHaveLength(1);
  expect(result.positions[0].lpAmount).toBe(100n);
  expect(vi.mocked(blockfrostFetch).mock.calls[1][0]).toContain(
    `/utxos/${pool.lpAsset}?count=2`,
  );
  expect(blockfrostFetch).toHaveBeenCalledTimes(2);
});
it("does no backend work when the wallet holds no LP tokens", async () => {
  expect(await readLiquidityPositions([])).toEqual({
    positions: [],
    errors: [],
    partial: false,
  });
  expect(blockfrostFetch).not.toHaveBeenCalled();
});
it("does not replace an unexpected response address with the requested pool address", async () => {
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce([
      { ...poolFixtures[0], address: "addr_test1wrong" },
    ]);
  const result = await readMinswapPools();
  expect(result.pools).toEqual([]);
  expect(result.errors[0]).toContain("another address");
});
