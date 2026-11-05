// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockfrostFetch } from "../dingo/blockfrost";
import { authenticatePool, type MinswapUtxo } from "./data";
import { poolFixtures } from "./fixtures";
import { readMinswapHistory } from "./history";
import {
  PREPROD_MINSWAP_V2,
  MAX_LIQUIDITY,
  BURNED_LIQUIDITY,
} from "./constants";
const resolve = vi.hoisted(() => vi.fn());
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("../dingo/config", async (original) => ({
  ...(await original<typeof import("../dingo/config")>()),
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
}));
vi.mock("../dingo/utxorpc/provider", async (original) => ({
  ...(await original<typeof import("../dingo/utxorpc/provider")>()),
  getDingoProvider: () => ({
    queryClient: { readGenesis: async () => ({ networkMagic: 1 }) },
    resolveUnspentOutputs: resolve,
  }),
}));
const fetch = vi.mocked(blockfrostFetch),
  hour = 3600000,
  now = Date.UTC(2026, 10, 5, 12),
  pool = authenticatePool(poolFixtures[1]);
function unspent(row: MinswapUtxo) {
  const assets = new Map(
    row.amount
      .filter((a) => a.unit !== "lovelace")
      .map((a) => [Core.AssetId(a.unit), BigInt(a.quantity)]),
  );
  const output = new Core.TransactionOutput(
    Core.Address.fromBech32(row.address),
    new Core.Value(
      BigInt(row.amount.find((a) => a.unit === "lovelace")!.quantity),
      assets,
    ),
  );
  output.setDatum(
    Core.Datum.newInlineData(
      Core.PlutusData.fromCbor(Core.HexBlob(row.inline_datum!)),
    ),
  );
  return new Core.TransactionUnspentOutput(
    new Core.TransactionInput(
      Core.TransactionId(row.tx_hash),
      BigInt(row.output_index),
    ),
    output,
  );
}
function historical(hash: string, zeroLp = false): MinswapUtxo {
  const row = structuredClone(poolFixtures[1]),
    data = Core.PlutusData.fromCbor(
      Core.HexBlob(row.inline_datum!),
    ).asConstrPlutusData()!,
    f = data.getData(),
    list = new Core.PlutusList();
  for (let i = 0; i < f.getLength(); i++)
    list.add(
      i === 5
        ? Core.PlutusData.newInteger(pool.reserveB * 2n)
        : i === 3 && zeroLp
          ? Core.PlutusData.newInteger(MAX_LIQUIDITY + BURNED_LIQUIDITY)
          : f.get(i),
    );
  row.inline_datum = Core.PlutusData.newConstrPlutusData(
    new Core.ConstrPlutusData(0n, list),
  ).toCbor();
  row.tx_hash = hash;
  row.amount = row.amount
    .filter((a) => !zeroLp || a.unit !== pool.lpAsset)
    .map((a) =>
      a.unit === pool.assetB
        ? { ...a, quantity: (BigInt(a.quantity) + pool.reserveB).toString() }
        : a,
    );
  return row;
}
function route(handler: (path: string) => unknown) {
  fetch.mockImplementation(async (path) =>
    path === "/api/v0/genesis"
      ? ({ network_magic: 1 } as never)
      : path === "/api/v0/blocks/latest"
        ? ({ time: now / 1000 } as never)
        : (handler(path) as never),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  resolve.mockReset().mockResolvedValue([unspent(poolFixtures[1])]);
  fetch.mockReset();
});
afterEach(() => vi.useRealTimers());
describe("Dingo-backed pool price history", () => {
  it("uses an authenticated earlier price despite LP-only transfers, including LP sent to the pool address", async () => {
    const old = "aa".repeat(32),
      transfer = "bb".repeat(32),
      state = historical(old),
      pollution = {
        ...structuredClone(poolFixtures[1]),
        amount: poolFixtures[1].amount.filter(
          (a) => a.unit !== PREPROD_MINSWAP_V2.poolAuthenAsset,
        ),
      };
    state.address = Core.Cardano.BaseAddress.fromCredentials(
      0,
      Core.Address.fromBech32(state.address).getProps().paymentPart!,
      {
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16("99".repeat(28)),
      },
    )
      .toAddress()
      .toBech32();
    route((path) =>
      path === `/api/v0/txs/${pool.txHash}`
        ? { hash: pool.txHash, block_time: (now - 12 * hour) / 1000 }
        : path.includes("/assets/")
          ? [
              { tx_hash: transfer, block_time: (now - 18 * hour) / 1000 },
              { tx_hash: old, block_time: (now - 8 * 24 * hour) / 1000 },
            ]
          : path.includes(transfer)
            ? { hash: transfer, outputs: [pollution] }
            : { hash: old, outputs: [pollution, state] },
    );
    const result = await readMinswapHistory(pool);
    expect(result.points).toHaveLength(29);
    expect(result.partial).toBe(false);
    expect(result.points[0].value).toBe(
      Number(pool.reserveB * 2n) / Number(pool.reserveA),
    );
    expect(result.points.at(-1)!.value).toBe(
      Number(pool.reserveB) / Number(pool.reserveA),
    );
    expect(
      fetch.mock.calls.filter(([path]) => path.endsWith("/utxos")),
    ).toHaveLength(2);
  });
  it("does not fill a week from a spent snapshot even when its creation predates the window", async () => {
    resolve.mockResolvedValue([]);
    route(() => ({
      hash: pool.txHash,
      block_time: (now - 8 * 24 * hour) / 1000,
    }));
    await expect(readMinswapHistory(pool)).rejects.toThrow("spent");
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/v0/genesis",
      "/api/v0/blocks/latest",
    ]);
  });
  it("rejects a substituted current reference and an unauthenticated current output", async () => {
    route(() => ({
      hash: pool.txHash,
      block_time: (now - 8 * 24 * hour) / 1000,
    }));
    resolve.mockResolvedValue([
      unspent({ ...poolFixtures[1], tx_hash: "ef".repeat(32) }),
    ]);
    await expect(readMinswapHistory(pool)).rejects.toThrow("spent");
    resolve.mockResolvedValue([
      unspent({
        ...poolFixtures[1],
        amount: poolFixtures[1].amount.filter(
          (asset) => asset.unit !== PREPROD_MINSWAP_V2.poolAuthenAsset,
        ),
      }),
    ]);
    await expect(readMinswapHistory(pool)).rejects.toThrow("authentication");
  });
  it("uses the verified unspent state across a whole week without querying LP transfers", async () => {
    route(() => ({
      hash: pool.txHash,
      block_time: (now - 8 * 24 * hour) / 1000,
    }));
    const result = await readMinswapHistory(pool);
    expect(result.points).toHaveLength(29);
    expect(result.partial).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("supports a valid current zero-LP snapshot through the same exact RPC verification", async () => {
    const row = historical(pool.txHash, true),
      zero = authenticatePool(row);
    resolve.mockResolvedValue([unspent(row)]);
    route(() => ({
      hash: zero.txHash,
      block_time: (now - 8 * 24 * hour) / 1000,
    }));
    const result = await readMinswapHistory(zero);
    expect(result.points).toHaveLength(29);
    expect(result.partial).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it("caps metadata at five pages and unique historical output reads at64 with concurrency4", async () => {
    let active = 0,
      peak = 0;
    fetch.mockImplementation(async (path) => {
      if (path === "/api/v0/genesis") return { network_magic: 1 } as never;
      if (path === "/api/v0/blocks/latest")
        return { time: now / 1000 } as never;
      if (path === `/api/v0/txs/${pool.txHash}`)
        return { hash: pool.txHash, block_time: now / 1000 } as never;
      if (path.includes("/assets/")) {
        const page = Number(/page=(\d+)/.exec(path)![1]);
        return Array.from({ length: 100 }, (_, i) => ({
          tx_hash: ((page - 1) * 100 + i).toString(16).padStart(64, "0"),
          block_time: (now - 8 * hour) / 1000,
        })) as never;
      }
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { hash: path.split("/").at(-2), outputs: [] } as never;
    });
    const result = await readMinswapHistory(pool),
      calls = fetch.mock.calls.map(([path]) => path);
    expect(calls.filter((path) => path.includes("/assets/"))).toHaveLength(5);
    expect(calls.filter((path) => path.endsWith("/utxos"))).toHaveLength(64);
    expect(new Set(calls.filter((path) => path.endsWith("/utxos"))).size).toBe(
      64,
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.points).toHaveLength(1);
    expect(result.partial).toBe(true);
  });
  it("leaves historical zero-LP intervals incomplete because the LP directory cannot index their swaps", async () => {
    const old = "cc".repeat(32),
      earlier = "dd".repeat(32),
      state = historical(old, true);
    route((path) =>
      path === `/api/v0/txs/${pool.txHash}`
        ? { hash: pool.txHash, block_time: now / 1000 }
        : path.includes("/assets/")
          ? [
              { tx_hash: old, block_time: (now - 8 * 24 * hour) / 1000 },
              { tx_hash: earlier, block_time: (now - 9 * 24 * hour) / 1000 },
            ]
          : path.includes(old)
            ? { hash: old, outputs: [state] }
            : { hash: earlier, outputs: [historical(earlier)] },
    );
    const result = await readMinswapHistory(pool);
    expect(result.points).toHaveLength(1);
    expect(result.partial).toBe(true);
  });
});

it("ends history at the Dingo tip even when the browser clock is far ahead", async () => {
  vi.setSystemTime(now + 30 * 24 * hour);
  route(() => ({
    hash: pool.txHash,
    block_time: (now - 8 * 24 * hour) / 1000,
  }));
  const result = await readMinswapHistory(pool);
  expect(result.points).toHaveLength(29);
  expect(result.points.at(-1)!.time).toBe(now);
  expect(result.points[0].time).toBe(now - 7 * 24 * hour);
  expect(result.partial).toBe(false);
});

it.each([-1, 1.5, Number.MAX_SAFE_INTEGER])(
  "rejects invalid Dingo tip time %s instead of using the browser clock",
  async (time) => {
    fetch.mockImplementation(async (path) =>
      path === "/api/v0/genesis"
        ? ({ network_magic: 1 } as never)
        : path === "/api/v0/blocks/latest"
          ? ({ time } as never)
          : ({
              hash: pool.txHash,
              block_time: (now - 8 * 24 * hour) / 1000,
            } as never),
    );
    await expect(readMinswapHistory(pool)).rejects.toThrow(
      "invalid chain time",
    );
  },
);

it("bounds the sample window before proving the current output unspent", async () => {
  let tip = now;
  fetch.mockImplementation(async (path) =>
    path === "/api/v0/genesis"
      ? ({ network_magic: 1 } as never)
      : path === "/api/v0/blocks/latest"
        ? ({ time: tip / 1000 } as never)
        : ({
            hash: pool.txHash,
            block_time: (now - 8 * 24 * hour) / 1000,
          } as never),
  );
  resolve.mockImplementation(async () => {
    tip += 6 * hour;
    return [unspent(poolFixtures[1])];
  });
  const result = await readMinswapHistory(pool);
  expect(result.points.at(-1)!.time).toBe(now);
});
