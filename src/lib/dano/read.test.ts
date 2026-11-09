// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { danoFixture, danoConfigFixture } from "./fixtures";
import { readDanoPools, readDanoPool, readDanoConfig } from "./read";
const mocks = vi.hoisted(() => ({ network: vi.fn(), search: vi.fn(), resolve: vi.fn(), config: {id:"mainnet"} }));
vi.mock("../dingo/config", () => ({DINGO_NETWORK:mocks.config}));
vi.mock("../dingo/walletSession", () => ({assertDingoTransactionBackends:mocks.network}));
vi.mock("../dingo/utxorpc/provider", () => ({getDingoProvider:()=>({resolveUnspentOutputs:mocks.resolve,queryClient:{inner:{searchUtxos:mocks.search}}})}));
beforeAll(()=>Core.initCrypto());
const rpc = (u=danoFixture()) => ({txoRef:{hash:Core.fromHex(String(u.input().transactionId())),index:Number(u.input().index())},nativeBytes:Core.fromHex(u.output().toCbor())});
beforeEach(()=>{vi.clearAllMocks();mocks.config.id="mainnet";mocks.network.mockResolvedValue(undefined);mocks.search.mockResolvedValue({items:[rpc()],nextToken:"next"});mocks.resolve.mockResolvedValue([danoFixture()]);});
it("queries bounded authenticated pool pages and preserves unsupported output errors",async()=>{
 const invalid=rpc();invalid.nativeBytes=new Uint8Array();mocks.search.mockResolvedValue({items:[rpc(),invalid],nextToken:"next"});
 const page=await readDanoPools("first");expect(page.pools).toHaveLength(1);expect(page.errors).toHaveLength(1);expect(page.nextToken).toBe("next");
 const request=mocks.search.mock.calls[0][0];expect(request.maxItems).toBe(20);expect(request.startToken).toBe("first");expect(Core.Address.fromBytes(Core.HexBlob.fromBytes(request.predicate.match.utxoPattern.value.address.exactAddress)).toBytes()).toBe(danoFixture().output().address().toBytes());
});
it("rejects competing pool states and repeated cursors",async()=>{
 mocks.search.mockResolvedValue({items:[rpc(),rpc()],nextToken:""});await expect(readDanoPools()).rejects.toThrow("competing");
 mocks.search.mockResolvedValue({items:[],nextToken:"next"});await expect(readDanoPools("next")).rejects.toThrow("invalid Dano CLMM page");
});
it("checks backend and network identity before reading",async()=>{
 mocks.network.mockRejectedValue(new Error("Backend mismatch"));await expect(readDanoPools()).rejects.toThrow("Backend mismatch");expect(mocks.search).not.toHaveBeenCalled();
 mocks.config.id="preview";await expect(readDanoPool("aa".repeat(32)+"#0")).rejects.toThrow("Mainnet");expect(mocks.resolve).not.toHaveBeenCalled();
});
it("requires exactly one authenticated configuration NFT",async()=>{
 mocks.search.mockResolvedValue({items:[rpc(danoConfigFixture())],nextToken:""});const config=await readDanoConfig();expect(config.swapFee).toBe(100000n);expect(config.platformFee).toBe(1000n);expect(mocks.search.mock.calls[0][0].maxItems).toBe(2);
 mocks.search.mockResolvedValue({items:[rpc()],nextToken:""});await expect(readDanoConfig()).rejects.toThrow("authenticated");
 mocks.search.mockResolvedValue({items:[],nextToken:""});await expect(readDanoConfig()).rejects.toThrow("one Dano configuration");
});
it("resolves a selected pool exactly and rejects foreign responses",async()=>{
 const u=danoFixture(),point=`${u.input().transactionId()}#${u.input().index()}`;await expect(readDanoPool(point)).resolves.toHaveProperty("name");expect(mocks.resolve.mock.calls[0][0][0].toCbor()).toBe(u.input().toCbor());
 mocks.resolve.mockResolvedValue([danoConfigFixture()]);await expect(readDanoPool(point)).rejects.toThrow("spent or unavailable");
 await expect(readDanoPool("aa".repeat(32)+"#01")).rejects.toThrow("transaction hash");
});
