// @vitest-environment node
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { rapidFixture } from "./fixtures";
import { decodeRapidPool, RAPID_POOL_HASH } from "./data";
import { readRapidPool, readRapidPools } from "./read";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  network: vi.fn(),
  config: { id: "mainnet" },
}));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: mocks.config }));
vi.mock("../dingo/walletSession", () => ({
  assertDingoTransactionBackends: mocks.network,
}));
vi.mock("../dingo/utxorpc/provider", () => ({
  getDingoProvider: () => ({
    queryClient: { inner: { searchUtxos: mocks.query } },
  }),
}));
beforeAll(() => Core.initCrypto());
function rpc(index = 0) {
  const utxo = rapidFixture(index);
  return {
    txoRef: {
      hash: Core.fromHex(String(utxo.input().transactionId())),
      index: Number(utxo.input().index()),
    },
    nativeBytes: Core.fromHex(utxo.output().toCbor()),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.id = "mainnet";
  mocks.network.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ items: [rpc()], nextToken: "" });
});
it("uses bounded marker discovery with the canonical payment credential and opaque cursor", async () => {
  await expect(readRapidPools("cursor")).resolves.toMatchObject({
    pools: [
      expect.objectContaining({ name: decodeRapidPool(rapidFixture()).name }),
    ],
    errors: [],
    nextToken: "",
  });
  const request = mocks.query.mock.calls[0][0];
  expect(request.maxItems).toBe(20);
  expect(request.startToken).toBe("cursor");
  expect(
    Core.toHex(request.predicate.match.utxoPattern.value.address.paymentPart),
  ).toBe(RAPID_POOL_HASH);
  expect(
    Core.toHex(request.predicate.match.utxoPattern.value.asset.assetName),
  ).toBe("50");
});
it("rejects a wrong backend or network before issuing pool queries", async () => {
  mocks.network.mockRejectedValue(new Error("Dingo backend mismatch"));
  await expect(readRapidPools()).rejects.toThrow("Dingo backend mismatch");
  expect(mocks.query).not.toHaveBeenCalled();
  mocks.config.id = "preview";
  await expect(readRapidPools()).rejects.toThrow("requires Cardano Mainnet");
});
it("keeps valid pools when a record cannot be decoded and rejects a self-repeating cursor", async () => {
  mocks.query.mockResolvedValue({
    items: [{ nativeBytes: new Uint8Array() }, rpc()],
    nextToken: "next",
  });
  const page = await readRapidPools();
  expect(page.pools).toHaveLength(1);
  expect(page.errors).toEqual([
    "Dingo returned an invalid WingRiders Rapid output.",
  ]);
  await expect(readRapidPools("next")).rejects.toThrow(
    "invalid WingRiders Rapid page",
  );
});
it("finds selected pools through marker outputs rather than wallet LP outputs", async () => {
  const pool = decodeRapidPool(rapidFixture());
  await expect(readRapidPool(pool.name)).resolves.toMatchObject({
    name: pool.name,
  });
  const request = mocks.query.mock.calls[0][0];
  expect(request.maxItems).toBe(20);
  expect(
    Core.toHex(request.predicate.match.utxoPattern.value.asset.assetName),
  ).toBe("50");
  mocks.query.mockResolvedValue({ items: [rpc(), rpc()], nextToken: "" });
  await expect(readRapidPool(pool.name)).rejects.toThrow(
    "Dingo repeated a WingRiders Rapid pool output.",
  );
  mocks.query.mockResolvedValue({ items: [rpc()], nextToken: "" });
  await expect(
    readRapidPool(decodeRapidPool(rapidFixture(1)).name),
  ).rejects.toThrow("pool is missing");
});

it("follows marker cursors and skips unrelated malformed outputs for a selected pool", async () => {
  const pool = decodeRapidPool(rapidFixture());
  mocks.query
    .mockResolvedValueOnce({
      items: [rpc(1), { nativeBytes: new Uint8Array() }],
      nextToken: "next",
    })
    .mockResolvedValueOnce({ items: [rpc()], nextToken: "" });
  await expect(readRapidPool(pool.name)).resolves.toMatchObject({
    name: pool.name,
  });
  expect(mocks.query.mock.calls.map(([request]) => request.startToken)).toEqual(
    ["", "next"],
  );
  expect(
    mocks.query.mock.calls.every(
      ([request]) =>
        Core.toHex(
          request.predicate.match.utxoPattern.value.asset.assetName,
        ) === "50",
    ),
  ).toBe(true);
});
it("stops a selected-pool lookup after five bounded marker pages", async () => {
  let count = 0;
  mocks.query.mockImplementation(async () => {
    const item = rpc(1);
    item.txoRef.index = ++count;
    return { items: [item], nextToken: `page-${count}` };
  });
  await expect(
    readRapidPool(decodeRapidPool(rapidFixture()).name),
  ).rejects.toThrow(
    "WingRiders Rapid lookup exceeded five bounded pool pages.",
  );
  expect(mocks.query).toHaveBeenCalledTimes(5);
});

it.each(["catalog", "selected"])("rejects two outpoints claiming the same pool in %s reads", async (kind) => {
  const first = rpc(), second = rpc();
  second.txoRef.index += 1;
  mocks.query.mockResolvedValue({ items: [first, second], nextToken: "" });
  await expect(kind === "catalog" ? readRapidPools() : readRapidPool(decodeRapidPool(rapidFixture()).name)).rejects.toThrow("competing WingRiders Rapid pool states");
});
it("rejects a repeated output reference carrying conflicting pool data", async () => {
  const first = rpc(), second = rpc(1);
  second.txoRef = first.txoRef;
  mocks.query.mockResolvedValue({ items: [first, second], nextToken: "" });
  await expect(readRapidPools()).rejects.toThrow("competing WingRiders Rapid pool states");
});
it("rejects an output index beyond the UTxO reference range", async () => {
  const item = rpc();
  item.txoRef.index = 0x100000000;
  mocks.query.mockResolvedValue({ items: [item], nextToken: "" });
  await expect(readRapidPools()).resolves.toMatchObject({ pools: [], errors: ["Dingo returned an invalid WingRiders Rapid output."] });
});
it("rejects a cross-page cursor cycle", async () => {
  mocks.query.mockResolvedValueOnce({ items: [], nextToken: "A" }).mockResolvedValueOnce({ items: [], nextToken: "B" }).mockResolvedValueOnce({ items: [], nextToken: "A" });
  await expect(readRapidPool(decodeRapidPool(rapidFixture()).name)).rejects.toThrow("repeated a WingRiders Rapid page cursor");
  expect(mocks.query).toHaveBeenCalledTimes(3);
});
