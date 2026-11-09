// @vitest-environment node
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { decodeSplashOrder } from "./data";
import type { Cip30WalletApi } from "../dingo/cip30";
import { splashFixture } from "./fixtures";
import { readSplashOrders, readSplashOrder, splashCancellationKeys } from "./read";
const mocks = vi.hoisted(() => ({ network: vi.fn(), search: vi.fn(), resolve: vi.fn(), config: { id: "mainnet" } }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: mocks.config }));
vi.mock("../dingo/walletSession", () => ({ assertDingoTransactionBackends: mocks.network }));
vi.mock("../dingo/utxorpc/provider", () => ({ getDingoProvider: () => ({ resolveUnspentOutputs: mocks.resolve, queryClient: { inner: { searchUtxos: mocks.search } } }) }));
beforeAll(() => Core.initCrypto());
function rpc() { const utxo = splashFixture(); return { txoRef: { hash: Core.fromHex(String(utxo.input().transactionId())), index: Number(utxo.input().index()) }, nativeBytes: Core.fromHex(utxo.output().toCbor()) }; }
const keys = () => [decodeSplashOrder(splashFixture()).cancelKey];
const account = () => splashFixture().output().address().toBech32();
beforeEach(() => { vi.clearAllMocks(); mocks.config.id = "mainnet"; mocks.network.mockResolvedValue(undefined); mocks.resolve.mockResolvedValue([splashFixture()]); mocks.search.mockResolvedValue({ items: [rpc()], nextToken: "" }); });
it("reads one bounded page for the complete account script address", async () => {
  const page = await readSplashOrders(account(), keys(), "cursor"); expect(page.orders).toHaveLength(1); expect(page.errors).toEqual([]);
  const request = mocks.search.mock.calls[0][0]; expect(request.maxItems).toBe(20); expect(request.startToken).toBe("cursor");
  expect(Core.toHex(request.predicate.match.utxoPattern.value.address.exactAddress)).toBe(splashFixture().output().address().toBytes());
});
it("checks backend identity and selected network before querying", async () => {
  mocks.network.mockRejectedValue(new Error("Backend mismatch")); await expect(readSplashOrders(account(), keys())).rejects.toThrow("Backend mismatch");
  mocks.config.id = "preprod"; await expect(readSplashOrders(account(), keys())).rejects.toThrow("require Cardano Mainnet"); expect(mocks.search).not.toHaveBeenCalled();
});
it("retains valid orders beside malformed CBOR and rejects cursor repetition", async () => {
  const invalid = rpc(); invalid.txoRef.index++; invalid.nativeBytes = new Uint8Array();
  mocks.search.mockResolvedValue({ items: [invalid, rpc()], nextToken: "next" });
  const page = await readSplashOrders(account(), keys()); expect(page.orders).toHaveLength(1); expect(page.errors).toEqual(["Invalid Splash output CBOR size."]);
  await expect(readSplashOrders(account(), keys(), "next")).rejects.toThrow("invalid Splash order page");
});
it("rejects repeated output references and invalid output indices", async () => {
  mocks.search.mockResolvedValue({ items: [rpc(), rpc()], nextToken: "" }); await expect(readSplashOrders(account(), keys())).rejects.toThrow("repeated a Splash output");
  const invalid = rpc(); invalid.txoRef.index = 0x100000000; mocks.search.mockResolvedValue({ items: [invalid], nextToken: "" });
  await expect(readSplashOrders(account(), keys())).rejects.toThrow("invalid Splash output reference");
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

it("rejects non-mainnet account listings before querying", async () => {
  const credential = Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("11".repeat(28)) });

  await expect(readSplashOrders(Core.addressFromCredential(0, credential).toBech32(), keys())).rejects.toThrow("Use a mainnet account address.");
  expect(mocks.search).not.toHaveBeenCalled();
});
it("rejects foreign account outputs and oversized pages", async () => {
  const item = rpc(), foreign = splashFixture(1);
  item.nativeBytes = Core.fromHex(foreign.output().toCbor());
  mocks.search.mockResolvedValue({ items: [item], nextToken: "" });
  const page = await readSplashOrders(account(), keys()); expect(page.orders).toEqual([]); expect(page.errors).toEqual(["Splash output is outside the requested account address."]);
  mocks.search.mockResolvedValue({ items: Array.from({ length: 21 }, rpc), nextToken: "" });
  await expect(readSplashOrders(account(), keys())).rejects.toThrow("invalid Splash order page");
});

it("filters shared script addresses using every wallet payment cancellation key", async () => {
 const credential = (hash: string) => Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16(hash) });
 const first = decodeSplashOrder(splashFixture()).cancelKey, second = "44".repeat(28);
 const address = Core.addressFromCredential(1, credential(first)), used = Core.addressFromCredential(1, credential(second));
 const api = { getChangeAddress: async () => address.toBytes(), getUsedAddresses: async () => [used.toBytes()], getUnusedAddresses: async () => [address.toBytes()] } as unknown as Cip30WalletApi;
 expect(await splashCancellationKeys(api)).toEqual([first, second]);
 const order = splashFixture(), output = new Core.TransactionOutput(Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: order.output().address().getProps().paymentPart!.hash })), order.output().amount()); output.setDatum(order.output().datum()!);
 const item = { txoRef: rpc().txoRef, nativeBytes: Core.fromHex(output.toCbor()) };
 mocks.search.mockResolvedValue({ items: [item], nextToken: "next" });
 expect((await readSplashOrders(address.toBech32(), [second])).orders).toEqual([]);
 const page = await readSplashOrders(address.toBech32(), await splashCancellationKeys(api)); expect(page.orders).toHaveLength(1); expect(page.nextToken).toBe("next");
});
