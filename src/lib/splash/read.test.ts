// @vitest-environment node
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { splashFixture } from "./fixtures";
import { readSplashOrders, readSplashOrder } from "./read";
const mocks = vi.hoisted(() => ({ network: vi.fn(), search: vi.fn(), resolve: vi.fn(), config: { id: "mainnet" } }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: mocks.config }));
vi.mock("../dingo/walletSession", () => ({ assertDingoTransactionBackends: mocks.network }));
vi.mock("../dingo/utxorpc/provider", () => ({ getDingoProvider: () => ({ resolveUnspentOutputs: mocks.resolve, queryClient: { inner: { searchUtxos: mocks.search } } }) }));
beforeAll(() => Core.initCrypto());
function rpc() { const utxo = splashFixture(); return { txoRef: { hash: Core.fromHex(String(utxo.input().transactionId())), index: Number(utxo.input().index()) }, nativeBytes: Core.fromHex(utxo.output().toCbor()) }; }
const account = () => splashFixture().output().address().toBech32();
beforeEach(() => { vi.clearAllMocks(); mocks.config.id = "mainnet"; mocks.network.mockResolvedValue(undefined); mocks.resolve.mockResolvedValue([splashFixture()]); mocks.search.mockResolvedValue({ items: [rpc()], nextToken: "" }); });
it("reads one bounded page for the complete account script address", async () => {
  const page = await readSplashOrders(account(), "cursor"); expect(page.orders).toHaveLength(1); expect(page.errors).toEqual([]);
  const request = mocks.search.mock.calls[0][0]; expect(request.maxItems).toBe(20); expect(request.startToken).toBe("cursor");
  expect(Core.toHex(request.predicate.match.utxoPattern.value.address.exactAddress)).toBe(splashFixture().output().address().toBytes());
});
it("checks backend identity and selected network before querying", async () => {
  mocks.network.mockRejectedValue(new Error("Backend mismatch")); await expect(readSplashOrders(account())).rejects.toThrow("Backend mismatch");
  mocks.config.id = "preprod"; await expect(readSplashOrders(account())).rejects.toThrow("require Cardano Mainnet"); expect(mocks.search).not.toHaveBeenCalled();
});
it("retains valid orders beside malformed CBOR and rejects cursor repetition", async () => {
  const invalid = rpc(); invalid.txoRef.index++; invalid.nativeBytes = new Uint8Array();
  mocks.search.mockResolvedValue({ items: [invalid, rpc()], nextToken: "next" });
  const page = await readSplashOrders(account()); expect(page.orders).toHaveLength(1); expect(page.errors).toEqual(["Invalid Splash output CBOR size."]);
  await expect(readSplashOrders(account(), "next")).rejects.toThrow("invalid Splash order page");
});
it("rejects repeated output references and invalid output indices", async () => {
  mocks.search.mockResolvedValue({ items: [rpc(), rpc()], nextToken: "" }); await expect(readSplashOrders(account())).rejects.toThrow("repeated a Splash output");
  const invalid = rpc(); invalid.txoRef.index = 0x100000000; mocks.search.mockResolvedValue({ items: [invalid], nextToken: "" });
  await expect(readSplashOrders(account())).rejects.toThrow("invalid Splash output reference");
});
it("resolves a selected order exactly once and rejects a mismatched response", async () => {
  const utxo = splashFixture(), outpoint = `${utxo.input().transactionId()}#${utxo.input().index()}`;
  await expect(readSplashOrder(outpoint)).resolves.toMatchObject({ cancelKey: expect.any(String) });
  expect(mocks.resolve.mock.calls[0][0].map((input: Core.TransactionInput) => input.toCbor())).toEqual([utxo.input().toCbor()]); expect(mocks.search).not.toHaveBeenCalled();
  mocks.resolve.mockResolvedValue([splashFixture(1)]); await expect(readSplashOrder(outpoint)).rejects.toThrow("spent or unavailable");
});
it.each(["invalid", "aa".repeat(32) + "#4294967296", "aa".repeat(32) + "#01"])("rejects invalid output %s before I/O", async (point) => {
  await expect(readSplashOrder(point)).rejects.toThrow("transaction hash"); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.network).not.toHaveBeenCalled();
});

it("rejects enterprise and non-mainnet account listings before querying", async () => {
  const credential = Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("11".repeat(28)) });
  await expect(readSplashOrders(Core.addressFromCredential(1, credential).toBech32())).rejects.toThrow("stake credential");
  await expect(readSplashOrders(Core.addressFromCredential(0, credential).toBech32())).rejects.toThrow("Use a mainnet account address.");
  expect(mocks.search).not.toHaveBeenCalled();
});
it("rejects foreign account outputs and oversized pages", async () => {
  const item = rpc(), foreign = splashFixture(1);
  item.nativeBytes = Core.fromHex(foreign.output().toCbor());
  mocks.search.mockResolvedValue({ items: [item], nextToken: "" });
  const page = await readSplashOrders(account()); expect(page.orders).toEqual([]); expect(page.errors).toEqual(["Splash output is outside the requested account address."]);
  mocks.search.mockResolvedValue({ items: Array.from({ length: 21 }, rpc), nextToken: "" });
  await expect(readSplashOrders(account())).rejects.toThrow("invalid Splash order page");
});
