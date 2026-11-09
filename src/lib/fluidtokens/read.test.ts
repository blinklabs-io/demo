// @vitest-environment node
import { walletScriptIdentity } from "../dingo/ownedScriptOutputs";
import livePools from "./pools.fixture.json";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import configFixture from "./config.fixture.json";
import { Core } from "@blaze-cardano/sdk";
import { pd } from "../kernel/actions";
import { decodeFluidPool, fluidFields } from "./data";
import type { Cip30WalletApi } from "../dingo/cip30";
import { fluidPoolFixture, fluidRpcOutput } from "./fixtures";
import { readFluidPools, readFluidPool, readFluidConfig } from "./read";
const mocks = vi.hoisted(() => ({ network: vi.fn(), search: vi.fn(), resolve: vi.fn(), config: { id: "mainnet" } }));
vi.mock("../dingo/config", () => ({ DINGO_NETWORK: mocks.config }));
vi.mock("../dingo/walletSession", () => ({ assertDingoTransactionBackends: mocks.network }));
vi.mock("../dingo/utxorpc/provider", () => ({ getDingoProvider: () => ({ resolveUnspentOutputs: mocks.resolve, queryClient: { inner: { searchUtxos: mocks.search } } }) }));
beforeAll(() => Core.initCrypto());
function rpc() { const utxo = fluidPoolFixture(); return { txoRef: { hash: Core.fromHex(String(utxo.input().transactionId())), index: Number(utxo.input().index()) }, nativeBytes: Core.fromHex(utxo.output().toCbor()) }; }
const keys = () => [decodeFluidPool(fluidPoolFixture()).key];
const account = () => fluidPoolFixture().output().address().toBech32();
const identity = (owner = account(), paymentKeys = keys()) => ({ addresses: [Core.Address.fromBech32(owner).toBytes()], keys: paymentKeys });
beforeEach(() => { vi.clearAllMocks(); mocks.config.id = "mainnet"; mocks.network.mockResolvedValue(undefined); mocks.resolve.mockResolvedValue([fluidPoolFixture()]); mocks.search.mockResolvedValue({ items: [rpc()], nextToken: "" }); });
it("reads one bounded page for the complete account script address", async () => {
  mocks.search.mockResolvedValueOnce({ items:[rpc()],nextToken:"first" }).mockResolvedValueOnce({items:[rpc()],nextToken:"second"});
  const first=await readFluidPools(identity());
  const page=await readFluidPools(identity(),first.nextToken); expect(page.pools).toHaveLength(1);expect(page.errors).toEqual([]);
  const request=mocks.search.mock.calls[1][0];expect(request.maxItems).toBe(20);expect(request.startToken).toBe("first");
  expect(Core.toHex(request.predicate.match.utxoPattern.value.address.exactAddress)).toBe(fluidPoolFixture().output().address().toBytes());
});
it("checks backend identity and selected network before querying", async () => {
  mocks.network.mockRejectedValue(new Error("Backend mismatch")); await expect(readFluidPools(identity())).rejects.toThrow("Backend mismatch");
  mocks.config.id = "preprod"; await expect(readFluidPools(identity())).rejects.toThrow("require Cardano Mainnet"); expect(mocks.search).not.toHaveBeenCalled();
});
it("retains valid orders beside malformed CBOR and rejects cursor repetition", async () => {
  const invalid = rpc(); invalid.txoRef.index++; invalid.nativeBytes = new Uint8Array();
  mocks.search.mockResolvedValue({ items: [invalid, rpc()], nextToken: "next" });
  const page = await readFluidPools(identity()); expect(page.pools).toHaveLength(1); expect(page.errors).toEqual(["Invalid script output CBOR size."]);
  await expect(readFluidPools(identity(), page.nextToken)).rejects.toThrow("invalid script-output page");
});
it("rejects repeated output references and invalid output indices", async () => {
  mocks.search.mockResolvedValue({ items: [rpc(), rpc()], nextToken: "" }); await expect(readFluidPools(identity())).rejects.toThrow("repeated a script output");
  const invalid = rpc(); invalid.txoRef.index = 0x100000000; mocks.search.mockResolvedValue({ items: [invalid], nextToken: "" });
  await expect(readFluidPools(identity())).rejects.toThrow("invalid script output reference");
});
it("resolves a selected order exactly once and rejects a mismatched response", async () => {
  const utxo = fluidPoolFixture(), outpoint = `${utxo.input().transactionId()}#${utxo.input().index()}`;
  await expect(readFluidPool(outpoint)).resolves.toMatchObject({ key: expect.any(String) });
  expect(mocks.resolve.mock.calls[0][0].map((input: Core.TransactionInput) => input.toCbor())).toEqual([utxo.input().toCbor()]); expect(mocks.search).not.toHaveBeenCalled();
  mocks.resolve.mockResolvedValue([fluidPoolFixture(1)]); await expect(readFluidPool(outpoint)).rejects.toThrow("spent or unavailable");
});
it.each(["invalid", "aa".repeat(32) + "#4294967296", "aa".repeat(32) + "#01"])("rejects invalid output %s before I/O", async (point) => {
  await expect(readFluidPool(point)).rejects.toThrow("transaction hash"); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.network).not.toHaveBeenCalled();
});

it("rejects non-mainnet account listings before querying", async () => {
  const credential = Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16("11".repeat(28)) });

  await expect(readFluidPools(identity(Core.addressFromCredential(0, credential).toBech32()))).rejects.toThrow("Use a mainnet account address.");
  expect(mocks.search).not.toHaveBeenCalled();
});
it("rejects foreign account outputs and oversized pages", async () => {
  const item = rpc(), foreign = fluidPoolFixture(1);
  item.nativeBytes = Core.fromHex(foreign.output().toCbor());
  mocks.search.mockResolvedValue({ items: [item], nextToken: "" });
  const page = await readFluidPools(identity()); expect(page.pools).toEqual([]); expect(page.errors).toEqual(["Dingo output is outside the requested wallet script address."]);
  mocks.search.mockResolvedValue({ items: Array.from({ length: 21 }, rpc), nextToken: "" });
  await expect(readFluidPools(identity())).rejects.toThrow("invalid script-output page");
});

it("filters shared script addresses using every wallet payment cancellation key", async () => {
 const credential = (hash: string) => Core.Credential.fromCore({ type: Core.CredentialType.KeyHash, hash: Core.Hash28ByteBase16(hash) });
 const first = decodeFluidPool(fluidPoolFixture()).key, second = "44".repeat(28);
 const address = Core.addressFromCredential(1, credential(first)), used = Core.addressFromCredential(1, credential(second));
 const api = { getNetworkId: async () => 1, getChangeAddress: async () => address.toBytes(), getUsedAddresses: async () => [used.toBytes()], getUnusedAddresses: async () => [address.toBytes()] } as unknown as Cip30WalletApi;
 expect( (await walletScriptIdentity(api,address.toBech32())).keys).toEqual([first, second]);
 const order = fluidPoolFixture(), output = new Core.TransactionOutput(Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: order.output().address().getProps().paymentPart!.hash })), order.output().amount()); output.setDatum(order.output().datum()!);
 const item = { txoRef: rpc().txoRef, nativeBytes: Core.fromHex(output.toCbor()) };
 mocks.search.mockResolvedValue({ items: [item], nextToken: "next" });
 expect((await readFluidPools(identity(address.toBech32(), [second]))).pools).toEqual([]);
 const page = await readFluidPools(await walletScriptIdentity(api,address.toBech32())); expect(page.pools).toHaveLength(1); expect(JSON.parse(page.nextToken).token).toBe("next");
});

it("requires one authenticated configuration NFT and checks its deployed hashes",async()=>{
 const config=fluidRpcOutput(configFixture.items[0]);const row={txoRef:{hash:Core.fromHex(String(config.input().transactionId())),index:Number(config.input().index())},nativeBytes:Core.fromHex(config.output().toCbor())};
 mocks.search.mockResolvedValue({items:[row],nextToken:""});await expect(readFluidConfig()).resolves.toHaveProperty("utxo");expect(mocks.search.mock.calls[0][0].maxItems).toBe(2);
 mocks.search.mockResolvedValue({items:[rpc()],nextToken:""});await expect(readFluidConfig()).rejects.toThrow("authenticated");
 mocks.search.mockResolvedValue({items:[row,row],nextToken:""});await expect(readFluidConfig()).rejects.toThrow("one FluidTokens configuration");
 mocks.search.mockResolvedValue({items:[row],nextToken:"more"});await expect(readFluidConfig()).rejects.toThrow("one FluidTokens configuration");
 const fields=fluidFields(config.output().datum()!.asInlineData()!,30);fields[2]=pd.bytes("44".repeat(28));
 const changed=new Core.TransactionOutput(config.output().address(),config.output().amount());changed.setDatum(Core.Datum.newInlineData(pd.con(0,fields)));
 mocks.search.mockResolvedValue({items:[{...row,nativeBytes:Core.fromHex(changed.toCbor())}],nextToken:""});await expect(readFluidConfig()).rejects.toThrow("deployment changed");
});

it("inspects actual V4 script-managed pools without listing them as payment-key pools",async()=>{
 const u=fluidRpcOutput(livePools.items[0]);mocks.resolve.mockResolvedValue([u]);const pool=await readFluidPool(`${u.input().transactionId()}#${u.input().index()}`);expect(pool.authTag).toBe(2n);
 const row={txoRef:{hash:Core.fromHex(String(u.input().transactionId())),index:Number(u.input().index())},nativeBytes:Core.fromHex(u.output().toCbor())};mocks.search.mockResolvedValue({items:[row],nextToken:""});
 const page=await readFluidPools(identity(u.output().address().toBech32(),[pool.key]));expect(page.pools).toEqual([]);
});

it("finds a payment-key pool created under a used wallet staking credential",async()=>{
 const first=fluidPoolFixture(),older=fluidPoolFixture(1),ownerKey=Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16(keys()[0])});
 const owner=(pool:Core.TransactionUnspentOutput)=>Core.addressFromCredentials(1,ownerKey,Core.Credential.fromCore(pool.output().address().getProps().delegationPart!));
 const wallet={keys:keys(),addresses:[owner(first).toBytes(),owner(older).toBytes()]};
 mocks.search.mockImplementation(async request=>{const wanted=Core.toHex(request.predicate.match.utxoPattern.value.address.exactAddress);return {items:wanted===older.output().address().toBytes()?[{txoRef:{hash:Core.fromHex(String(older.input().transactionId())),index:Number(older.input().index())},nativeBytes:Core.fromHex(older.output().toCbor())}]:[],nextToken:""};});
 const page=await readFluidPools(wallet);expect(page.pools).toEqual([]);expect(page.nextToken).not.toBe("");const next=await readFluidPools(wallet,page.nextToken);expect(next.pools.map(p=>p.utxo.input().toCbor())).toEqual([older.input().toCbor()]);expect(next.nextToken).toBe("");expect(mocks.search).toHaveBeenCalledTimes(2);
});
