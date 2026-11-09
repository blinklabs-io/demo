// @vitest-environment node
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { rapidFixture } from "./fixtures";
import { decodeRapidPool, RAPID_POOL_HASH } from "./data";
import { readRapidPool, readRapidPools } from "./read";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolve: vi.fn(),
  network: vi.fn(),
  config: { id: "mainnet" },
}));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: mocks.config }));
vi.mock("../dingo/walletSession", () => ({
  assertDingoTransactionBackends: mocks.network,
}));
vi.mock("../dingo/utxorpc/provider", () => ({
  getDingoProvider: () => ({
    resolveUnspentOutputs: mocks.resolve,
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
  mocks.resolve.mockResolvedValue([rapidFixture()]);
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
it("rejects two outpoints claiming the same pool in a catalog page", async () => {
  const first = rpc(), second = rpc(); second.txoRef.index += 1;
  mocks.query.mockResolvedValue({ items: [first, second], nextToken: "" });
  await expect(readRapidPools()).rejects.toThrow("competing WingRiders Rapid pool states");
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

it("resolves exactly the selected output without traversing the pool catalog", async () => {
  const pool = rapidFixture();
  const outpoint = `${pool.input().transactionId()}#${pool.input().index()}`;
  await expect(readRapidPool(outpoint)).resolves.toMatchObject({ name: decodeRapidPool(pool).name });
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(mocks.resolve.mock.calls[0][0].map((input: Core.TransactionInput) => input.toCbor())).toEqual([pool.input().toCbor()]);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects unavailable and mismatched selected outputs", async () => {
  const pool = rapidFixture(); const outpoint = `${pool.input().transactionId()}#${pool.input().index()}`;
  mocks.resolve.mockResolvedValue([]);
  await expect(readRapidPool(outpoint)).rejects.toThrow("spent or unavailable");
  mocks.resolve.mockResolvedValue([rapidFixture(1)]);
  await expect(readRapidPool(outpoint)).rejects.toThrow("spent or unavailable");
  mocks.resolve.mockResolvedValue([pool, pool]);
  await expect(readRapidPool(outpoint)).rejects.toThrow("spent or unavailable");
});
it.each(["bad", "ab".repeat(32) + "#4294967296", "ab".repeat(32) + "#01"])("rejects invalid selected output %s before I/O", async (outpoint) => {
  await expect(readRapidPool(outpoint)).rejects.toThrow("pool transaction hash");
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.network).not.toHaveBeenCalled();
});
