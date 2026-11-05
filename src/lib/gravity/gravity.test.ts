// @vitest-environment node
import { BlockfrostError } from "../dingo/blockfrost";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeGravityOracle, GRAVITY_INDEXER_POLICY } from "./data";
import { gravityOracleFixture } from "./fixture";
import { readGravityPools, readGravityPoolComposition } from "./read";
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: { id: "preprod" } }));
const fetch = vi.hoisted(() => vi.fn());
vi.mock("../dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../dingo/blockfrost")>()),
  blockfrostFetch: fetch,
}));
const unit =
  GRAVITY_INDEXER_POLICY +
  "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8";
beforeEach(() => fetch.mockReset());
describe("Gravity on-chain discovery", () => {
  it("decodes a deployed oracle and distinguishes state and token-pool scripts", () => {
    const pool = decodeGravityOracle(gravityOracleFixture);
    expect(pool.id).toBe(
      "698098510cc00cb761dfd218c58dc0bc4cee2e00540a1e871a0e9dfa",
    );
    expect(pool.poolHash).toBe(
      "389a00ad03b3b93af58a22569be145b4a8a896cbbf4caf5191fda8f6",
    );
    expect(pool.assetA).toBe("lovelace");
    expect(pool.assetB).toBe(
      "899e46d62232b0440d828659368d75587d7629b90080a8b4fea0128b56454741",
    );
    expect(pool.poolType).toBe(0);
    expect(pool.poolAddress).toBe(
      "addr_test1xquf5q9dqwemjwh43g39dxlpgk6232ykewl5et63j8763ansg224ylygtstgjxzf33crd7ey9zhsxtg2yj7altgapmfqy60p9x",
    );
  });
  it("rejects an oracle-shaped datum with the right NFT name under the wrong policy", () => {
    expect(() =>
      decodeGravityOracle({
        ...gravityOracleFixture,
        amount: [
          ...gravityOracleFixture.amount.filter(
            (a) =>
              a.unit !==
              "698098510cc00cb761dfd218c58dc0bc4cee2e00540a1e871a0e9dfa0001",
          ),
          { unit: "ff".repeat(28) + "0001", quantity: "1" },
        ],
      }),
    ).toThrow("NFT");
  });
  it("uses bounded authenticated address discovery and reports unsupported states", async () => {
    fetch
      .mockResolvedValueOnce({ network_magic: 1 })
      .mockResolvedValueOnce([
        { address: gravityOracleFixture.address, quantity: "1" },
        { address: "invalid", quantity: "1" },
      ])
      .mockResolvedValueOnce([gravityOracleFixture]);
    const result = await readGravityPools(unit);
    expect(result.pools).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.partial).toBe(false);
    expect(fetch.mock.calls[1][0]).toContain("count=20&page=1");
    expect(fetch.mock.calls[2][0]).toContain(
      result.pools[0].id + "0001?count=2&page=1",
    );
  });
  it("rejects a valid oracle returned under an unrelated asset index", async () => {
    fetch
      .mockResolvedValueOnce({ network_magic: 1 })
      .mockResolvedValueOnce([
        { address: gravityOracleFixture.address, quantity: "1" },
      ])
      .mockResolvedValueOnce([
        {
          ...gravityOracleFixture,
          amount: [
            ...gravityOracleFixture.amount,
            { unit: GRAVITY_INDEXER_POLICY + "ab".repeat(32), quantity: "1" },
          ],
        },
      ]);
    const result = await readGravityPools(
      GRAVITY_INDEXER_POLICY + "ab".repeat(32),
    );
    expect(result.pools).toEqual([]);
    expect(result.errors).toEqual([
      "Gravity oracle does not match the selected indexer asset.",
    ]);
  });
  it("reads token-pool composition rather than the state oracle's ADA buffer", async () => {
    const pool = decodeGravityOracle(gravityOracleFixture);
    fetch.mockResolvedValueOnce({ network_magic: 1 }).mockResolvedValueOnce([
      {
        ...gravityOracleFixture,
        address: pool.poolAddress,
        amount: [{ unit: "lovelace", quantity: "9000000" }],
      },
    ]);
    const result = await readGravityPoolComposition(pool);
    expect(fetch.mock.calls[1][0]).toContain(
      `/addresses/${pool.poolAddress}/utxos?count=100`,
    );
    expect(result.amounts).toEqual([{ asset: "lovelace", quantity: 9000000n }]);
  });
  it("propagates cancellation rather than returning a false empty discovery", async () => {
    const controller = new AbortController();
    fetch
      .mockResolvedValueOnce({ network_magic: 1 })
      .mockImplementationOnce(() => {
        controller.abort();
        return [];
      });
    await expect(
      readGravityPools(unit, 1, controller.signal),
    ).rejects.toBeDefined();
  });
});

it("treats only Dingo asset-holder not-found as an empty directory", async () => {
  const path = `/api/v0/assets/${unit}/addresses?count=20&page=1`;
  fetch.mockResolvedValueOnce({ network_magic: 1 }).mockRejectedValueOnce(
    new BlockfrostError("Not found", 404, path, {
      message: "The requested asset could not be found.",
    }),
  );
  await expect(readGravityPools(unit)).resolves.toEqual({
    pools: [],
    errors: [],
    partial: false,
  });
  for (const error of [
    new BlockfrostError("Unavailable", 500, path, {
      message: "The requested asset could not be found.",
    }),
    new BlockfrostError("Unknown route", 404, path, {
      message: "Unknown route",
    }),
    new BlockfrostError("Wrong path", 404, "/api/v0/genesis", {
      message: "The requested asset could not be found.",
    }),
  ]) {
    fetch
      .mockResolvedValueOnce({ network_magic: 1 })
      .mockRejectedValueOnce(error);
    await expect(readGravityPools(unit)).rejects.toBe(error);
  }
});
