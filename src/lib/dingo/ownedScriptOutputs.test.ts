// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "./cip30";
import { readOwnedScriptPage, walletScriptIdentity } from "./ownedScriptOutputs";
const mocks=vi.hoisted(()=>({search:vi.fn(),resolve:vi.fn()}));
vi.mock("./utxorpc/provider",()=>({getDingoProvider:()=>({resolveUnspentOutputs:mocks.resolve,queryClient:{inner:{searchUtxos:mocks.search}}})}));
beforeAll(()=>Core.initCrypto());beforeEach(()=>vi.clearAllMocks());
const key=(hex:string)=>Core.Credential.fromCore({type:Core.CredentialType.KeyHash,hash:Core.Hash28ByteBase16(hex.repeat(28))});
const base=(stake:string,payment="11")=>Core.addressFromCredentials(1,key(payment),key(stake));
const target=(owner:Core.Address)=>{const payment=Core.Credential.fromCore({type:Core.CredentialType.ScriptHash,hash:Core.Hash28ByteBase16("99".repeat(28))}),stake=owner.getProps().delegationPart;return stake?Core.addressFromCredentials(1,payment,Core.Credential.fromCore(stake)):Core.addressFromCredential(1,payment);};
function rpc(address:Core.Address,index=0){return {txoRef:{hash:Core.fromHex("aa".repeat(32)),index},nativeBytes:Core.fromHex(new Core.TransactionOutput(address,new Core.Value(2000000n)).toCbor())};}
it("collects every wallet address and payment key, rejecting stale accounts and other networks",async()=>{
 const owner=base("22"),used=base("33","44"),enterprise=Core.addressFromCredential(1,key("11"));
 const api={getNetworkId:vi.fn(async()=>1),getChangeAddress:async()=>owner.toBytes(),getUsedAddresses:async()=>[used.toBytes(),enterprise.toBytes()],getUnusedAddresses:async()=>[owner.toBytes()]}as unknown as Cip30WalletApi;
 const identity=await walletScriptIdentity(api,owner.toBech32());expect(identity.keys).toEqual(["11".repeat(28),"44".repeat(28)]);expect(new Set(identity.addresses)).toEqual(new Set([owner.toBytes(),used.toBytes(),enterprise.toBytes()]));
 await expect(walletScriptIdentity(api,used.toBech32())).rejects.toThrow("Wallet account changed");vi.mocked(api.getNetworkId).mockResolvedValue(0);await expect(walletScriptIdentity(api,owner.toBech32())).rejects.toThrow("mainnet wallet");
 vi.mocked(api.getNetworkId).mockResolvedValue(1);api.getUnusedAddresses=async()=>[Core.addressFromCredential(0,key("55")).toBytes()];await expect(walletScriptIdentity(api,owner.toBech32())).rejects.toThrow("mainnet wallet address");
});
it("covers all distinct wallet-derived script addresses with one bounded query per page",async()=>{
 const owners=[base("22"),base("33"),Core.addressFromCredential(1,key("11")),base("22","44")];
 const identity={addresses:owners.map(a=>a.toBytes()),keys:["11".repeat(28),"44".repeat(28)]};
 mocks.search.mockImplementation(async request=>({items:[rpc(Core.Address.fromBytes(Core.HexBlob.fromBytes(request.predicate.match.utxoPattern.value.address.exactAddress)))],nextToken:""}));
 let cursor="";const seen:string[]=[];
 for(let i=0;i<3;i++){const page=await readOwnedScriptPage(identity,target,u=>u.output().address().toBytes(),cursor);seen.push(...page.records);cursor=page.nextToken;expect(page.errors).toEqual([]);expect(i<2?!!cursor:cursor).toBe(i<2?true:"");}
 expect(new Set(seen)).toEqual(new Set(owners.map(a=>target(a).toBytes())));expect(mocks.search).toHaveBeenCalledTimes(3);for(const [request]of mocks.search.mock.calls)expect(request.maxItems).toBe(20);
});
it("preserves opaque RPC cursors and tolerates wallet address ordering changes",async()=>{
 const owners=[base("22"),base("33")],identity={addresses:owners.map(a=>a.toBytes()),keys:["11".repeat(28)]};
 mocks.search.mockResolvedValueOnce({items:[],nextToken:"opaque:cursor+/="}).mockResolvedValueOnce({items:[],nextToken:""});
 const first=await readOwnedScriptPage(identity,target,u=>u,"");await readOwnedScriptPage({...identity,addresses:[...identity.addresses].reverse()},target,u=>u,first.nextToken);expect(mocks.search.mock.calls[1][0].startToken).toBe("opaque:cursor+/=");
});
it("rejects stale wallet cursors before reading a different address set",async()=>{
 const identity={addresses:[base("22").toBytes()],keys:["11".repeat(28)]};mocks.search.mockResolvedValue({items:[],nextToken:"more"});
 const first=await readOwnedScriptPage(identity,target,u=>u);await expect(readOwnedScriptPage({...identity,addresses:[...identity.addresses,base("33").toBytes()]},target,u=>u,first.nextToken)).rejects.toThrow("Wallet addresses or page cursor changed");expect(mocks.search).toHaveBeenCalledTimes(1);
});
it("rejects malformed and oversized cursors without querying Dingo",async()=>{
 const identity={addresses:[base("22").toBytes()],keys:["11".repeat(28)]};for(const cursor of ["invalid","x".repeat(4097),JSON.stringify({version:1,account:999,token:"",fingerprint:"wrong"})])await expect(readOwnedScriptPage(identity,target,u=>u,cursor)).rejects.toThrow();expect(mocks.search).not.toHaveBeenCalled();
});
