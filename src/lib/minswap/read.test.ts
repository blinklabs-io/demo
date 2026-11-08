// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { readMinswapOrders, orderDatum, orderAddress } from "./orders";
import { PREPROD_MINSWAP_V2 } from "./constants";
import { beforeEach, expect, it, vi } from "vitest";
import {
  readMinswapPools,
  readLiquidityPositions,
  readMinswapPool,
} from "./read";
import { authenticatePool } from "./data";
import { poolFixtures } from "./fixtures";
import { blockfrostFetch } from "../dingo/blockfrost";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 } }));
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
    `/utxos/${pool.lpAsset}?count=20`,
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
  expect(result.errors[0]).toContain("Unrecognized Minswap pool address");
});

it("ignores LP-only pollution across bounded pages before counting authenticated pool states", async () => {
  const pool = authenticatePool(poolFixtures[0]);
  const polluted = Array.from({ length: 20 }, (_, i) => ({
    ...poolFixtures[0],
    tx_hash: i.toString(16).padStart(64, "0"),
    amount: poolFixtures[0].amount.filter(
      (asset) => asset.unit !== PREPROD_MINSWAP_V2.poolAuthenAsset,
    ),
  }));
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce(polluted)
    .mockResolvedValueOnce([poolFixtures[0]]);
  await expect(readMinswapPool(pool)).resolves.toMatchObject({
    lpAsset: pool.lpAsset,
  });
  expect(vi.mocked(blockfrostFetch).mock.calls[2][0]).toContain(
    "count=20&page=2",
  );
});
it("fails explicitly rather than accepting an incomplete bounded LP lookup", async () => {
  const pool = authenticatePool(poolFixtures[0]);
  let page = 0;
  vi.mocked(blockfrostFetch).mockImplementation(async (path) =>
    path === "/api/v0/genesis"
      ? { network_magic: 1 }
      : Array.from({ length: 20 }, (_, i) => ({
          ...poolFixtures[0],
          tx_hash: (page++ * 20 + i).toString(16).padStart(64, "0"),
          amount: poolFixtures[0].amount.filter(
            (asset) => asset.unit !== PREPROD_MINSWAP_V2.poolAuthenAsset,
          ),
        })),
  );
  await expect(readMinswapPool(pool)).rejects.toThrow("bounded 100-output");
  expect(blockfrostFetch).toHaveBeenCalledTimes(6);
});
it("finds old payment-key orders after change rotation with one shared stake-address read", async () => {
  const stake = Core.Credential.fromCore({
    type: Core.CredentialType.KeyHash,
    hash: Core.Hash28ByteBase16("33".repeat(28)),
  });
  const address = (key: string) =>
    Core.addressFromCredentials(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16(key.repeat(28)),
      }),
      stake,
    );
  const old = address("11"),
    current = address("22"),
    pool = authenticatePool(poolFixtures[0]);
  const row = {
    ...poolFixtures[0],
    address: orderAddress(old).toBech32(),
    inline_datum: orderDatum(
      old,
      pool.lpAsset,
      { kind: "withdraw", lpAmount: 1n, slippageBps: 0 },
      { minimumA: 1n, minimumB: 1n },
    ).toCbor(),
  };
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce([row]);
  const result = await readMinswapOrders([
    current.toBech32(),
    old.toBech32(),
    old.toBech32(),
  ]);
  expect(result.orders).toHaveLength(1);
  expect(result.orders[0].canceller).toBe("11".repeat(28));
  expect(blockfrostFetch).toHaveBeenCalledTimes(2);
});
it("rejects an oversized staking-address scope before making any order API requests", async () => {
  const payment = Core.Credential.fromCore({
    type: Core.CredentialType.KeyHash,
    hash: Core.Hash28ByteBase16("11".repeat(28)),
  });
  const senders = Array.from({ length: 21 }, (_, i) =>
    Core.addressFromCredentials(
      0,
      payment,
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16(i.toString(16).padStart(56, "0")),
      }),
    ).toBech32(),
  );
  await expect(readMinswapOrders(senders)).rejects.toThrow("at most 20");
  expect(blockfrostFetch).not.toHaveBeenCalled();
});

it("ignores another authenticated pool that holds the requested LP token", async () => {
  const pool = authenticatePool(poolFixtures[0]);
  const other = {
    ...poolFixtures[1],
    amount: [...poolFixtures[1].amount, { unit: pool.lpAsset, quantity: "1" }],
  };
  expect(authenticatePool(other).lpAsset).not.toBe(pool.lpAsset);
  vi.mocked(blockfrostFetch)
    .mockResolvedValueOnce({ network_magic: 1 })
    .mockResolvedValueOnce([other, poolFixtures[0]]);
  await expect(readMinswapPool(pool)).resolves.toMatchObject({ lpAsset: pool.lpAsset });
});
