import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DanoMarket } from "./DanoMarket";
import { readDanoPool, readDanoPools, readDanoConfig } from "../../lib/dano/read";
import { quoteDano, type DanoPool } from "../../lib/dano/data";
import { prepareDanoSwap } from "../../lib/dano/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet" } }));
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: () => ({
    status: "disconnected",
    tokens: [],
    balanceLovelace: null,
  }),
}));
vi.mock("../../lib/dano/read", () => ({
  readDanoConfig: vi.fn(),
  readDanoPool: vi.fn(),
  readDanoPools: vi.fn(),
  danoOutpoint: (pool: DanoPool) => `${pool.utxo.input().transactionId()}#${pool.utxo.input().index()}`,
}));
vi.mock("../../lib/dano/transactions", () => ({
  prepareDanoSwap: vi.fn(async () => ({})),
  submitDanoSwap: vi.fn(),
}));
vi.mock("./MarketTransaction", () => ({
  MarketConfirmation: () => null,
  MarketTransaction: (props: {
    ready: boolean;
    draftKey: string;
    title: string;
    prepare: (api: Cip30WalletApi, current: () => void) => Promise<unknown>;
  }) => (
    <button
      disabled={!props.ready}
      data-draft-key={props.draftKey}
      onClick={() => void props.prepare({} as Cip30WalletApi, () => {})}
    >
      {props.title}
    </button>
  ),
}));
const config = { platformFee:1000n, swapFee:100000n, utxo:{input:()=>({transactionId:()=>"55".repeat(32),index:()=>0n,toCbor:()=>"configuration"})} } as unknown as Awaited<ReturnType<typeof readDanoConfig>>;
const pool = { name:"aa".repeat(32), x:"11".repeat(28)+"414141",y:"22".repeat(28)+"424242",reserveX:1000000000n,reserveY:1000000000n,an:1n,ad:2n,bn:2n,bd:1n,fee:30n,minX:100n,minY:100n,utxo:{input:()=>({transactionId:()=>"33".repeat(32),index:()=>0n})} } as unknown as DanoPool;
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(readDanoConfig).mockResolvedValue(config);
  vi.mocked(readDanoPools).mockResolvedValue({
    pools: [pool],
    errors: [],
    nextToken: "next",
  });
  vi.mocked(readDanoPool).mockResolvedValue(pool);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
});
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <DanoMarket />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  );
  await flush();
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
}
function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype,
    "value",
  )!.set!.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLInputElement ? "input" : "change", {
      bubbles: true,
    }),
  );
}

it("reviews raw token amounts and pins the fee configuration",async()=>{
 await render(); await act(async()=>button("Review Dano CLMM swap").click());
 expect(prepareDanoSwap).toHaveBeenCalledWith(expect.anything(),{poolName:pool.name,poolOutpoint:"33".repeat(32)+"#0",configOutpoint:"55".repeat(32)+"#0",aToB:true,amount:1000000n,minimum:quoteDano(pool,config,true,1000000n).received},expect.any(Function));
 await act(async()=>change(host.querySelector("select")!,"b-to-a"));await act(async()=>button("Review Dano CLMM swap").click());
 expect(prepareDanoSwap).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({aToB:false,amount:1000000n,minimum:quoteDano(pool,config,false,1000000n).received}),expect.any(Function));
});
it("blocks an unavailable configuration while retaining pool inspection",async()=>{
 vi.mocked(readDanoConfig).mockRejectedValue(new Error("Configuration unavailable"));await render();
 expect(host.textContent).toContain("Configuration unavailable");expect(button("Review Dano CLMM swap").disabled).toBe(true);expect(host.querySelectorAll(".market-card")).toHaveLength(1);
});
it("invalidates the reviewed draft when configuration changes",async()=>{
 await render();const before=button("Review Dano CLMM swap").dataset.draftKey;
 await act(async()=>{client.setQueryData(["dingo","markets","dano","configuration"],{...config,utxo:{input:()=>({transactionId:()=>"66".repeat(32),index:()=>0n,toCbor:()=>"newconfiguration"})}});});await flush();expect(button("Review Dano CLMM swap").dataset.draftKey).not.toBe(before);
});

it("shows the included platform share and reserves the staking note for ADA pools",async()=>{
 await render();expect(host.textContent).toContain("300 AAA base units for the platform");expect(host.textContent).not.toContain("cannot be traded here");
 const ada = {...pool,x:"lovelace"};await act(async()=>client.setQueryData(["dingo","markets","dano","pools",""],{pools:[ada],errors:[],nextToken:""}));await flush();expect(host.textContent).toContain("ADA pools require staking reward settlement");expect(button("Review Dano CLMM swap").disabled).toBe(true);
});
