import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { afterEach,beforeAll,beforeEach,expect,it,vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { IndigoMarket } from "./IndigoMarket";
import { decodeIndigoManager,decodeIndigoPosition,indigoPoint } from "../../lib/indigo/data";
import { decodeRpcOutput } from "../../lib/dingo/ownedScriptOutputs";
import { readIndigoManager,readIndigoPosition,readIndigoPositions } from "../../lib/indigo/read";
import { prepareIndigoAction } from "../../lib/indigo/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import managerFixture from "../../lib/indigo/manager.fixture.json";
import positionsFixture from "../../lib/indigo/positions.fixture.json";
vi.mock("../../lib/dingo/config",()=>({DINGO_NETWORK:{id:"mainnet",label:"Mainnet",networkMagic:764824073},DINGO_CONFIG:{blockfrostUrl:"http://localhost",utxorpcUrl:"http://localhost"}}));
const wallet=vi.hoisted(()=>({status:"disconnected",changeAddress:null as string|null,walletApi:{}as Cip30WalletApi}));
vi.mock("../../stores/walletStore",()=>({useWalletStore:()=>wallet}));
vi.mock("../../lib/indigo/read",()=>({readIndigoManager:vi.fn(),readIndigoPosition:vi.fn(),readIndigoPositions:vi.fn()}));
vi.mock("../../lib/indigo/transactions",()=>({prepareIndigoAction:vi.fn(async()=>({})),submitIndigoAction:vi.fn()}));
vi.mock("./MarketTransaction",()=>({MarketConfirmation:()=>null,MarketTransaction:(props:{ready:boolean;title:string;draftKey:string;prepare:(api:Cip30WalletApi,guard:()=>void)=>Promise<unknown>})=><button disabled={!props.ready} data-draft-key={props.draftKey} onClick={()=>void props.prepare({}as Cip30WalletApi,()=>{})}>{props.title}</button>}));
let host:HTMLDivElement,root:Root,client:QueryClient;
function fixture(item:{nativeBytes:string;txoRef:{hash:string;index:number}}){return decodeRpcOutput({nativeBytes:Uint8Array.from(atob(item.nativeBytes),c=>c.charCodeAt(0)),txoRef:{hash:Uint8Array.from(atob(item.txoRef.hash),c=>c.charCodeAt(0)),index:item.txoRef.index}});}
beforeAll(()=>Core.initCrypto());beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();wallet.status="disconnected";wallet.changeAddress=null;vi.mocked(readIndigoManager).mockResolvedValue(decodeIndigoManager(fixture(managerFixture.items[0])));vi.mocked(readIndigoPosition).mockResolvedValue(decodeIndigoPosition(fixture(positionsFixture.items[0])));vi.mocked(readIndigoPositions).mockResolvedValue({positions:[],errors:[],nextToken:""});host=document.createElement("div");document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false}}});});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.useRealTimers();});
async function render(){await act(async()=>root.render(<MemoryRouter><QueryClientProvider client={client}><IndigoMarket/></QueryClientProvider></MemoryRouter>));await act(async()=>{await vi.advanceTimersByTimeAsync(1);});}
const button=(label:string)=>[...host.querySelectorAll("button")].find(e=>e.textContent===label)!;
function change(label:string,value:string){const input=[...host.querySelectorAll("label")].find(e=>e.textContent?.startsWith(label))!.querySelector("input")!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));}
async function lookup(){const position=decodeIndigoPosition(fixture(positionsFixture.items[0]));await act(async()=>change("Position output reference",indigoPoint(position)));await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));await act(async()=>{await vi.advanceTimersByTimeAsync(1);});return position;}
it("uses six-decimal INDY quantities and invalidates review when the amount changes",async()=>{
 await render();await act(async()=>change("INDY amount","1.123456"));await act(async()=>button("Review Indigo transaction").click());expect(prepareIndigoAction).toHaveBeenCalledWith(expect.anything(),{kind:"stake",amount:1123456n},expect.any(Function));const before=button("Review Indigo transaction").dataset.draftKey;await act(async()=>change("INDY amount","2"));expect(button("Review Indigo transaction").dataset.draftKey).not.toBe(before);expect(host.textContent).toContain("2 ADA");
});
it("blocks invalid or zero staking amounts",async()=>{
 await render();for(const value of ["0","-1","1.1234567"]){await act(async()=>change("INDY amount",value));expect(button("Review Indigo transaction").disabled).toBe(true);}expect(prepareIndigoAction).not.toHaveBeenCalled();
});
it("loads exact positions and builds claim, withdrawal, and close actions",async()=>{
 await render();const position=await lookup();expect(readIndigoPosition).toHaveBeenCalledWith(indigoPoint(position),expect.any(AbortSignal));await act(async()=>button("Review Indigo transaction").click());expect(prepareIndigoAction).toHaveBeenLastCalledWith(expect.anything(),{kind:"adjust",point:indigoPoint(position),amount:0n},expect.any(Function));
 await act(async()=>button("Withdraw stake").click());await act(async()=>change("INDY amount","10"));await act(async()=>button("Review Indigo transaction").click());expect(prepareIndigoAction).toHaveBeenLastCalledWith(expect.anything(),{kind:"adjust",point:indigoPoint(position),amount:-10000000n},expect.any(Function));
 await act(async()=>button("Close position").click());expect(host.textContent).toContain("Active governance locks must expire");expect(host.textContent).toContain("746.502844 INDY");expect(host.textContent).not.toContain("ADA INDY");await act(async()=>button("Review Indigo transaction").click());expect(prepareIndigoAction).toHaveBeenLastCalledWith(expect.anything(),{kind:"close",point:indigoPoint(position)},expect.any(Function));
});
it("blocks review when the live manager cannot be authenticated",async()=>{
 vi.mocked(readIndigoManager).mockRejectedValue(new Error("manager unavailable"));await render();expect(button("Review Indigo transaction").disabled).toBe(true);expect(host.textContent).toContain("manager unavailable");
});

it("formats INDY consistently when the browser default locale uses dot grouping",async()=>{
 const original=BigInt.prototype.toLocaleString,format=vi.spyOn(BigInt.prototype,"toLocaleString").mockImplementation(function(this:bigint,...args){return original.call(this,args[0]??"de-DE",args[1]);});
 try{await render();expect(host.textContent).toContain("11,776,792.382497 INDY");}finally{format.mockRestore();}
});
