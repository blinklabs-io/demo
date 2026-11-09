import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { FluidTokensMarket } from "./FluidTokensMarket";
import { fluidPoolFixture } from "../../lib/fluidtokens/fixtures";
import { decodeFluidPool, fluidPoint } from "../../lib/fluidtokens/data";
import { readFluidPool, readFluidPools } from "../../lib/fluidtokens/read";
import { prepareFluidAction } from "../../lib/fluidtokens/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "http://localhost", utxorpcUrl: "http://localhost" } }));
const wallet = vi.hoisted(() => ({ status: "disconnected", changeAddress: null as string | null, tokens: [], walletApi: {} as Cip30WalletApi }));
vi.mock("../../stores/walletStore", () => ({ useWalletStore: () => wallet }));
vi.mock("../../lib/dingo/ownedScriptOutputs", () => ({ walletScriptIdentity: vi.fn(async () => ({ keys: ["11".repeat(28)], addresses: ["61"+"11".repeat(28)] })) }));
vi.mock("../../lib/fluidtokens/read", () => ({ readFluidPool: vi.fn(), readFluidPools: vi.fn() }));
vi.mock("../../lib/fluidtokens/transactions", () => ({ prepareFluidAction: vi.fn(async () => ({})), submitFluidAction: vi.fn() }));
vi.mock("./MarketTransaction", () => ({ MarketConfirmation: () => null, MarketTransaction: (props: { ready: boolean; title: string; draftKey: string; prepare: (api: Cip30WalletApi, guard: () => void) => Promise<unknown> }) => <button disabled={!props.ready} data-draft-key={props.draftKey} onClick={() => void props.prepare({} as Cip30WalletApi, () => {})}>{props.title}</button> }));
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeAll(() => Core.initCrypto());
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); wallet.status = "disconnected"; wallet.changeAddress = null; const order = decodeFluidPool(fluidPoolFixture()); vi.mocked(readFluidPools).mockResolvedValue({ pools: [order], errors: [], nextToken: "" }); vi.mocked(readFluidPool).mockResolvedValue(order); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><FluidTokensMarket /></QueryClientProvider></MemoryRouter>)); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); }
const button = (label: string) => [...host.querySelectorAll("button")].find((element) => element.textContent === label)!;
function change(label: string, value: string) { const input = [...host.querySelectorAll("label")].find((element) => element.textContent?.startsWith(label))!.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }

it("forwards exact static lending and collateral terms",async()=>{
 await render();expect(button("Review FluidTokens transaction").disabled).toBe(true);
 const token="33".repeat(28)+"01";await act(async()=>{change("Collateral asset",token);change("Collateral quantity required","1000000");});await act(async()=>button("Review FluidTokens transaction").click());
 expect(prepareFluidAction).toHaveBeenCalledWith(expect.anything(),{kind:"create",terms:{principal:"lovelace",collateral:token,amount:100000000n,collateralAmount:1000000n,principalRatio:1000000n,interest:1000n,hours:720,repaymentWindow:24,extraAda:0n}},expect.any(Function));
 expect(host.textContent).toContain("100.00 ADA");const before=button("Review FluidTokens transaction").dataset.draftKey;await act(async()=>change("Repayment due after","1440"));expect(button("Review FluidTokens transaction").dataset.draftKey).not.toBe(before);
});
it("loads and cancels a selected pool without its burned identifier in returned value",async()=>{
 await render();const point=fluidPoint(decodeFluidPool(fluidPoolFixture()));await act(async()=>change("Pool output reference",point));await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(readFluidPool).toHaveBeenCalledWith(point,expect.any(AbortSignal));await act(async()=>button("Review FluidTokens transaction").click());expect(prepareFluidAction).toHaveBeenCalledWith(expect.anything(),{kind:"cancel",outpoint:point},expect.any(Function));expect(host.textContent).toContain("Existing loans and their bonds stay active");expect(host.querySelectorAll(".market-quote p")).toHaveLength(1);
});
it("blocks invalid loan interest before building",async()=>{
 await render();await act(async()=>{change("Collateral asset","33".repeat(28)+"01");change("Collateral quantity required","1000000");change("Total loan interest","0");});expect(button("Review FluidTokens transaction").disabled).toBe(true);expect(prepareFluidAction).not.toHaveBeenCalled();
});

it("inspects script-managed pools without enabling a payment-key cancellation",async()=>{
 const pool={...decodeFluidPool(fluidPoolFixture()),authTag:2n};vi.mocked(readFluidPool).mockResolvedValue(pool);
 await render();await act(async()=>change("Pool output reference",fluidPoint(pool)));await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(host.textContent).toContain("Current pool value");expect(host.textContent).toContain("requires script authorization");expect(button("Review FluidTokens transaction").disabled).toBe(true);expect(prepareFluidAction).not.toHaveBeenCalled();
});

it("requires explicit quantities after changing either asset denomination",async()=>{
 await render();await act(async()=>{change("Collateral asset","33".repeat(28)+"01");change("Collateral quantity required","1000000");});expect(button("Review FluidTokens transaction").disabled).toBe(false);
 await act(async()=>change("Principal asset","55".repeat(28)+"02"));expect(button("Review FluidTokens transaction").disabled).toBe(true);
 const input=(label:string)=>[...host.querySelectorAll("label")].find(e=>e.textContent?.startsWith(label))!.querySelector("input")!;
 expect(input("Amount to lend").value).toBe("");expect(input("For each principal quantity").value).toBe("");
 await act(async()=>{change("Amount to lend","1000000");change("For each principal quantity","1000000");});expect(button("Review FluidTokens transaction").disabled).toBe(false);
 await act(async()=>change("Collateral asset","lovelace"));expect(input("Collateral quantity required").value).toBe("");expect(button("Review FluidTokens transaction").disabled).toBe(true);
});

it("accepts uppercase collateral identifiers as canonical lowercase units",async()=>{
 await render();const token="ab".repeat(28)+"4a";await act(async()=>{change("Collateral asset",token.toUpperCase());change("Collateral quantity required","1000000");});await act(async()=>button("Review FluidTokens transaction").click());expect(prepareFluidAction).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({terms:expect.objectContaining({collateral:token})}),expect.any(Function));
});
it("refreshes from the first wallet page after browsing another script address",async()=>{
 wallet.status="connected";wallet.changeAddress="addr1_fixture";const data=await vi.mocked(readFluidPools)({keys:["11".repeat(28)],addresses:["61"+"11".repeat(28)]});vi.mocked(readFluidPools).mockImplementation(async(_,cursor)=>({...data,nextToken:cursor?"":"next"}));
 await render();await act(async()=>button("Next pools").click());await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(host.textContent).toContain("Page 2");const before=vi.mocked(readFluidPools).mock.calls.length;
 await act(async()=>button("Refresh ↻").click());await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(host.textContent).toContain("Page 1");expect(vi.mocked(readFluidPools).mock.calls.length).toBeGreaterThan(before);expect(vi.mocked(readFluidPools).mock.lastCall?.[1]).toBe("");
});
