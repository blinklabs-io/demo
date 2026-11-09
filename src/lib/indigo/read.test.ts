import { decodeRpcOutput } from "../dingo/ownedScriptOutputs";
// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { beforeAll,beforeEach,expect,it,vi } from "vitest";
import { pd } from "../kernel/actions";
import { decodeIndigoManager,decodeIndigoPosition,indigoReward,indigoAvailable,positionDatum,indigoPoint,INDIGO_POSITION } from "./data";
import { readIndigoManager,readIndigoPosition,readIndigoPositions,assertIndigoMainnet } from "./read";
import managerFixture from "./manager.fixture.json";
import positionFixture from "./positions.fixture.json";
const mocks=vi.hoisted(()=>({search:vi.fn(),resolve:vi.fn(),backend:vi.fn(),network:{id:"mainnet"}}));
vi.mock("../dingo/config",()=>({DINGO_NETWORK:mocks.network}));vi.mock("../dingo/walletSession",()=>({assertDingoTransactionBackends:mocks.backend}));vi.mock("../dingo/utxorpc/provider",()=>({getDingoProvider:()=>({resolveUnspentOutputs:mocks.resolve,queryClient:{inner:{searchUtxos:mocks.search}}})}));
beforeAll(()=>Core.initCrypto());beforeEach(()=>{vi.clearAllMocks();mocks.network.id="mainnet";});
function rpc(item:{nativeBytes:string;txoRef:{hash:string;index:number}}){return {nativeBytes:Uint8Array.from(atob(item.nativeBytes),c=>c.charCodeAt(0)),txoRef:{hash:Uint8Array.from(atob(item.txoRef.hash),c=>c.charCodeAt(0)),index:item.txoRef.index}};}
it("decodes mainnet manager and position datums and computes integer ADA rewards",()=>{
 const manager=decodeIndigoManager(decodeRpcOutput(rpc(managerFixture.items[0]))),position=decodeIndigoPosition(decodeRpcOutput(rpc(positionFixture.items[0])));
 expect(manager.total).toBe(11776792382497n);expect(position.amount).toBe(746502844n);expect(position.owner).toBe("caa1842a84f9d69cd0814d16c072e4f4aaa045f8d85c20587ed3c045");
 expect(indigoReward({...manager,snapshot:position.snapshot+10000000000n},position)).toBe(7465028n);expect(indigoAvailable({...position,locks:[{poll:1n,amount:500n,end:101n},{poll:2n,amount:800n,end:100n}]},100n)).toBe(position.amount-500n);
});
it("authenticates the manager NFT and rejects unsupported datums and inconsistent snapshots",()=>{
 const manager=decodeIndigoManager(decodeRpcOutput(rpc(managerFixture.items[0]))),position=decodeIndigoPosition(decodeRpcOutput(rpc(positionFixture.items[0])));
 expect(()=>decodeIndigoManager(position.utxo)).toThrow("authenticated");expect(()=>decodeIndigoPosition(manager.utxo)).toThrow("authenticated");
 const out=new Core.TransactionOutput(position.utxo.output().address(),Core.Value.fromCbor(position.utxo.output().amount().toCbor()));out.setDatum(Core.Datum.newInlineData(pd.con(1,[pd.con(0,[pd.bytes(position.owner),pd.list([]),pd.int(0n)])])));expect(()=>decodeIndigoPosition(new Core.TransactionUnspentOutput(position.utxo.input(),out))).toThrow("Unsupported");
 expect(()=>indigoReward({...manager,snapshot:position.snapshot-1n},position)).toThrow("inconsistent");
 const locked=new Core.TransactionOutput(position.utxo.output().address(),Core.Value.fromCbor(position.utxo.output().amount().toCbor()));locked.setDatum(Core.Datum.newInlineData(positionDatum(position.owner,[{poll:1n,amount:position.amount+1n,end:100n}],position.snapshot)));expect(()=>decodeIndigoPosition(new Core.TransactionUnspentOutput(position.utxo.input(),locked))).toThrow("staked INDY");
});
it("finds exactly one authenticated manager with a bounded NFT query",async()=>{
 mocks.search.mockResolvedValue({items:[rpc(managerFixture.items[0])],nextToken:""});await expect(readIndigoManager()).resolves.toHaveProperty("total");expect(mocks.search.mock.calls[0][0].maxItems).toBe(2);
 for(const response of [{items:[],nextToken:""},{items:[rpc(managerFixture.items[0]),rpc(managerFixture.items[0])],nextToken:""},{items:[rpc(managerFixture.items[0])],nextToken:"more"}]){mocks.search.mockResolvedValue(response);await expect(readIndigoManager()).rejects.toThrow("one Indigo staking manager");}
});
it("filters shared-address pages by wallet payment keys while preserving empty-page cursors",async()=>{
 const rows=positionFixture.items.map(rpc),position=decodeIndigoPosition(decodeRpcOutput(rows[0]));mocks.search.mockResolvedValue({items:rows,nextToken:"opaque+/="});const page=await readIndigoPositions([position.owner]);expect(page.positions.map(indigoPoint)).toEqual([indigoPoint(position)]);expect(page.nextToken).toBe("opaque+/=");expect(mocks.search.mock.calls[0][0].maxItems).toBe(20);
 const empty=await readIndigoPositions(["11".repeat(28)]);expect(empty.positions).toEqual([]);expect(empty.nextToken).toBe("opaque+/=");
});
it("rejects invalid pages, references, outpoints and other networks",async()=>{
 const row=rpc(positionFixture.items[0]);mocks.search.mockResolvedValue({items:[row,row],nextToken:""});await expect(readIndigoPositions(["11".repeat(28)])).rejects.toThrow("repeated");
 mocks.search.mockResolvedValue({items:[row],nextToken:"same"});await expect(readIndigoPositions(["11".repeat(28)],"same")).rejects.toThrow("invalid Indigo staking page");
 expect(()=>decodeRpcOutput({...row,txoRef:{...row.txoRef,index:-1}})).toThrow("invalid script output reference");await expect(readIndigoPosition("wrong")).rejects.toThrow("transaction hash");await expect(readIndigoPositions([])).rejects.toThrow("keys");
 mocks.network.id="preview";await expect(assertIndigoMainnet()).rejects.toThrow("requires Mainnet");
});
it("resolves exact unspent position outpoints and rejects mismatched output responses",async()=>{
 const position=decodeIndigoPosition(decodeRpcOutput(rpc(positionFixture.items[0])));mocks.resolve.mockResolvedValue([position.utxo]);await expect(readIndigoPosition(indigoPoint(position))).resolves.toHaveProperty("owner",position.owner);
 mocks.resolve.mockResolvedValue([]);await expect(readIndigoPosition(indigoPoint(position))).rejects.toThrow("spent or unavailable");
 const different=new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId("aa".repeat(32)),999n),Core.TransactionOutput.fromCbor(position.utxo.output().toCbor()));mocks.resolve.mockResolvedValue([different]);await expect(readIndigoPosition(indigoPoint(position))).rejects.toThrow("spent or unavailable");
});
it("reports unsupported outputs without hiding remaining wallet positions",async()=>{
 const row=rpc(positionFixture.items[0]),bad=decodeRpcOutput(rpc(positionFixture.items[1])),out=new Core.TransactionOutput(bad.output().address(),new Core.Value(2000000n,new Map([[Core.AssetId(INDIGO_POSITION),1n]])));out.setDatum(Core.Datum.newInlineData(pd.con(0)));mocks.search.mockResolvedValue({items:[{txoRef:rpc(positionFixture.items[1]).txoRef,nativeBytes:Core.fromHex(out.toCbor())},row],nextToken:""});const position=decodeIndigoPosition(decodeRpcOutput(row));const page=await readIndigoPositions([position.owner]);expect(page.positions).toHaveLength(1);expect(page.errors).toHaveLength(1);
});

it("keeps valid wallet positions when another row has malformed CBOR",async()=>{
 const row=rpc(positionFixture.items[0]),position=decodeIndigoPosition(decodeRpcOutput(row));mocks.search.mockResolvedValue({items:[{...row,txoRef:{...row.txoRef,index:999},nativeBytes:new Uint8Array([0xff])},row],nextToken:"more"});const page=await readIndigoPositions([position.owner]);expect(page.positions.map(indigoPoint)).toEqual([indigoPoint(position)]);expect(page.errors).toHaveLength(1);expect(page.nextToken).toBe("more");
});
