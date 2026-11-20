import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { OutputHistory } from "./OutputHistory";
import { readKupo } from "../../lib/dingo/kupo";
vi.mock("../../lib/dingo/kupo",async original=>({...await original<typeof import("../../lib/dingo/kupo")>(),readKupo:vi.fn()}));
const row={transaction_id:"aa".repeat(32),output_index:2,address:"addr_test1_fixture",value:{coins:"2000000",assets:{["11".repeat(28)+".01"]:"9007199254740993"}},created_at:{slot_no:100,header_hash:"bb".repeat(32)},spent_at:{slot_no:120,header_hash:"cc".repeat(32)},datum_hash:"dd".repeat(32),script_hash:"ee".repeat(28)};
let root:Root,host:HTMLDivElement,client:QueryClient;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.mocked(readKupo).mockImplementation(async path=>({data:path.startsWith("/matches")?[row,{...row,transaction_id:"invalid"}]:{datum:"d87980"},truncated:path.startsWith("/matches")}));});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.useRealTimers();});
async function render(pattern="addr_test1_fixture"){await act(async()=>root.render(<MemoryRouter><QueryClientProvider client={client}><OutputHistory pattern={pattern}/></QueryClientProvider></MemoryRouter>));}
async function flush(){await act(async()=>{await vi.advanceTimersByTimeAsync(1);});}
const button=(name:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent===name)!;
it("loads history on demand, keeps exact quantities, and isolates unsupported records",async()=>{
 await render();expect(readKupo).not.toHaveBeenCalled();await act(async()=>button("Show output history").click());await flush();expect(readKupo).toHaveBeenCalledWith("/matches/addr_test1_fixture?order=most_recent_first",expect.any(AbortSignal));expect(host.textContent).toContain("9007199254740993 base units");expect(host.textContent).toContain("1 unsupported records");expect(host.textContent).toContain("spent at slot 120");expect(host.textContent).toContain("first 20 records");expect(host.textContent).not.toContain("Kupo");
 const select=host.querySelector("select")!;await act(async()=>{select.value="unspent";select.dispatchEvent(new Event("change",{bubbles:true}));});await flush();expect(vi.mocked(readKupo).mock.lastCall?.[0]).toContain("&unspent");
 const detail=host.querySelector("details:nth-of-type(1)");expect(detail).not.toBeNull();
 const datum=[...host.querySelectorAll("details")].find(d=>d.querySelector("summary")?.textContent==="Inspect datum")!;await act(async()=>{datum.open=true;datum.dispatchEvent(new Event("toggle"));});await flush();expect(readKupo).toHaveBeenCalledWith("/datums/"+row.datum_hash,expect.any(AbortSignal));expect(host.textContent).toContain("d87980");
});
it("aborts a replaced entity and ignores its late response",async()=>{
 let finish!:(value:Awaited<ReturnType<typeof readKupo>>)=>void;vi.mocked(readKupo).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();await act(async()=>button("Show output history").click());const signal=vi.mocked(readKupo).mock.calls[0][1]!;await render("addr_test1_other");expect(signal.aborted).toBe(true);await act(async()=>finish({data:[row],truncated:false}));await flush();expect(host.textContent).not.toContain("9007199254740993");expect(button("Show output history")).toBeDefined();
});
it("reports request failure separately from an empty indexed history",async()=>{
 vi.mocked(readKupo).mockRejectedValue(new Error("Index unavailable"));await render();await act(async()=>button("Show output history").click());await flush();expect(host.textContent).toContain("Index unavailable");expect(host.textContent).not.toContain("0 supported outputs");vi.mocked(readKupo).mockResolvedValue({data:[],truncated:false});await act(async()=>button("Refresh outputs").click());await flush();expect(host.textContent).toContain("0 supported outputs");
});
