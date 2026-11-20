// @vitest-environment node
import { expect, it, vi, afterEach } from "vitest";
import { isKupoReadPath, kupoFetch, readKupoPayload, readKupo, kupoMatchesPath, decodeKupoMatch } from "./kupo";
vi.mock("./config",()=>({DINGO_CONFIG:{kupoUrl:"https://kupo.example:1442"}}));
afterEach(()=>vi.unstubAllGlobals());
function stream(parts:string[],cancel=vi.fn()) {let i=0;return new Response(new ReadableStream({pull(c){if(i===parts.length)c.close();else c.enqueue(new TextEncoder().encode(parts[i++]));},cancel}),{headers:{"Content-Type":"application/json"}});}
const row={transaction_id:"aa".repeat(32),output_index:0,address:"addr_test1_fixture",value:{coins:"18446744073709551615",assets:{["11".repeat(28)+".01"]:"9007199254740993"}},created_at:{slot_no:100,header_hash:"bb".repeat(32)},spent_at:null,datum_hash:null,script_hash:null};
it("reads arrays across string escapes, delimiters and UTF-8 chunk boundaries",async()=>{
 const values=[{text:'comma, brace} quote" slash\\ café'},{slot_no:4},"*",42];const body=JSON.stringify(values);expect((await readKupoPayload(stream([...body]))).data).toEqual(values);
 expect((await readKupoPayload(stream(["[", " ] \n"]))).data).toEqual([]);
});
it("stops and cancels an unbounded match stream after 20 preview records",async()=>{
 const cancel=vi.fn(),body="["+Array.from({length:22},(_,i)=>JSON.stringify({...row,output_index:i})).join(",");const result=await readKupoPayload(stream([body],cancel));expect(result.truncated).toBe(true);expect(result.data).toHaveLength(20);expect(cancel).toHaveBeenCalled();
});
it.each([['[{},',']'],['[{}'],['[{},,,{}]'],['[{}] trailing']])("rejects incomplete or malformed JSON %s",async(...parts)=>{await expect(readKupoPayload(stream(parts))).rejects.toThrow();});
it("bounds bytes, propagates abort and reports HTTP failures",async()=>{
 await expect(readKupoPayload(stream(['["'+"x".repeat(1024*1024)+'"]']))).rejects.toThrow("1 MiB");const controller=new AbortController();controller.abort();await expect(readKupoPayload(stream(['[]']),controller.signal)).rejects.toThrow();
 vi.stubGlobal("fetch",vi.fn(async()=>new Response('{"error":"unavailable"}',{status:503,headers:{"Content-Type":"application/json"}})));await expect(readKupo("/health")).rejects.toThrow("503");
});
it("preserves uint64 quantities and rejects rounded or invalid values",()=>{
 const decoded=decodeKupoMatch(row);expect(decoded.value.coins).toBe("18446744073709551615");expect(decoded.value.assets["11".repeat(28)+".01"]).toBe("9007199254740993");
 for(const coins of [9007199254740992,-1,"18446744073709551616","1.5"]){expect(()=>decodeKupoMatch({...row,value:{coins}})).toThrow("quantity");}
 expect(()=>decodeKupoMatch({...row,output_index:-1})).toThrow("fields");
});
it("allows only same-origin Kupo reads and negotiates exact string quantities",async()=>{
 for(const path of ["https://evil.test","//evil.test/health","/matches/../health","/datums/%2e%2e/health","/health#x","/tx/submit"]){expect(isKupoReadPath(path)).toBe(false);}
 const fetch=vi.fn(async()=>stream(['[]']));vi.stubGlobal("fetch",fetch);await kupoFetch("/patterns");expect(fetch).toHaveBeenCalledWith("https://kupo.example:1442/patterns",expect.objectContaining({method:"GET",headers:{Accept:"application/json;asset-quantity=string"}}));
 expect(kupoMatchesPath("*/"+"11".repeat(28),"spent")).toBe('/matches/*/'+'11'.repeat(28)+'?order=most_recent_first&spent');expect(()=>kupoMatchesPath("*?unspent", "all")).toThrow();
});
it("decodes split UTF-8 bytes and cancels an idle stream on abort",async()=>{
 const bytes=new TextEncoder().encode('[{"text":"café"}]');let i=0;const utf8=new Response(new ReadableStream({pull(c){if(i===bytes.length)c.close();else { c.enqueue(bytes.slice(i, i + 1)); i++; }}}),{headers:{"Content-Type":"application/json"}});expect((await readKupoPayload(utf8)).data).toEqual([{text:"café"}]);
 const cancel=vi.fn(),controller=new AbortController(),response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("["));},cancel}),{headers:{"Content-Type":"application/json"}});const pending=readKupoPayload(response,controller.signal);await Promise.resolve();controller.abort();await expect(pending).rejects.toThrow();expect(cancel).toHaveBeenCalled();
});
