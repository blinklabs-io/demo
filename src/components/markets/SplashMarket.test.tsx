import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { SplashMarket } from "./SplashMarket";
import { splashFixture } from "../../lib/splash/fixtures";
import { decodeSplashOrder, splashPoint } from "../../lib/splash/data";
import { readSplashOrder, readSplashOrders } from "../../lib/splash/read";
import { prepareSplashAction } from "../../lib/splash/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "mainnet", label: "Mainnet", networkMagic: 764824073 }, DINGO_CONFIG: { blockfrostUrl: "http://localhost", utxorpcUrl: "http://localhost" } }));
const wallet = vi.hoisted(() => ({ status: "disconnected", changeAddress: null as string | null, tokens: [] }));
vi.mock("../../stores/walletStore", () => ({ useWalletStore: () => wallet }));
vi.mock("../../lib/splash/read", () => ({ readSplashOrder: vi.fn(), readSplashOrders: vi.fn() }));
vi.mock("../../lib/splash/transactions", () => ({ prepareSplashAction: vi.fn(async () => ({})), submitSplashAction: vi.fn() }));
vi.mock("./MarketTransaction", () => ({ MarketConfirmation: () => null, MarketTransaction: (props: { ready: boolean; title: string; draftKey: string; prepare: (api: Cip30WalletApi, guard: () => void) => Promise<unknown> }) => <button disabled={!props.ready} data-draft-key={props.draftKey} onClick={() => void props.prepare({} as Cip30WalletApi, () => {})}>{props.title}</button> }));
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeAll(() => Core.initCrypto());
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); wallet.status = "disconnected"; wallet.changeAddress = null; const order = decodeSplashOrder(splashFixture()); vi.spyOn(order.owner, "toBech32").mockReturnValue("addr1_fixture" as Core.PaymentAddress); vi.mocked(readSplashOrders).mockResolvedValue({ orders: [order], errors: [], nextToken: "" }); vi.mocked(readSplashOrder).mockResolvedValue(order); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><SplashMarket /></QueryClientProvider></MemoryRouter>)); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); }
const button = (label: string) => [...host.querySelectorAll("button")].find((element) => element.textContent === label)!;
function change(label: string, value: string) { const input = [...host.querySelectorAll("label")].find((element) => element.textContent?.startsWith(label))!.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }
it("forwards exact base-unit terms and the entire visible execution budget", async () => {
  await render(); expect(button("Review Splash transaction").disabled).toBe(true);
  const unit = "33".repeat(28) + "01";
  await act(async () => { change("Output asset", unit); change("Minimum to receive", "1234567"); });
  expect(host.textContent).toContain("18.00 ADA");
  await act(async () => button("Review Splash transaction").click());
  expect(prepareSplashAction).toHaveBeenCalledWith(expect.anything(), { kind: "create", terms: { input: "lovelace", output: unit, amount: 10000000n, minimum: 1234567n, stepCost: 1000000n, steps: 4, executorFee: 2000000n, extraAda: 2000000n } }, expect.any(Function));
  const previous = button("Review Splash transaction").dataset.draftKey;
  await act(async () => change("Target execution steps", "5"));
  expect(button("Review Splash transaction").dataset.draftKey).not.toBe(previous); expect(host.textContent).toContain("19.00 ADA");
});
it("loads an exact order reference and forwards it for cancellation", async () => {
  await render(); const point = splashPoint(decodeSplashOrder(splashFixture()));
  await act(async () => change("Order output reference", point));
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(readSplashOrder).toHaveBeenCalledWith(point, expect.any(AbortSignal));
  await act(async () => button("Review Splash transaction").click());
  expect(prepareSplashAction).toHaveBeenCalledWith(expect.anything(), { kind: "cancel", outpoint: point }, expect.any(Function)); expect(readSplashOrders).not.toHaveBeenCalled();
});
it("blocks invalid execution budgets before preparation", async () => {
  await render(); await act(async () => { change("Output asset", "33".repeat(28) + "01"); change("Minimum to receive", "100"); change("Target execution steps", "17"); });
  expect(button("Review Splash transaction").disabled).toBe(true); expect(host.textContent).toContain("one and sixteen"); expect(prepareSplashAction).not.toHaveBeenCalled();
});

it("navigates forward again after revisiting a cached page", async () => {
  wallet.status = "connected"; wallet.changeAddress = "addr1_fixture";
  const first = await vi.mocked(readSplashOrders)("addr1_fixture");
  vi.mocked(readSplashOrders).mockImplementation(async (_, cursor) => ({ ...first, nextToken: cursor ? "" : "second" }));
  await render();
  await act(async () => button("Next orders").click()); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(host.textContent).toContain("Page 2");
  await act(async () => button("Previous orders").click()); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(host.textContent).toContain("Page 1");
  await act(async () => button("Next orders").click()); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(host.textContent).toContain("Page 2");
});
it("preserves create draft identity across account-order changes and cached refresh failures", async () => {
  wallet.status = "connected"; wallet.changeAddress = "addr1_fixture";
  await render(); await act(async () => { change("Output asset", "33".repeat(28) + "01"); change("Minimum to receive", "100"); });
  const draft = button("Review Splash transaction").dataset.draftKey;
  vi.mocked(readSplashOrders).mockResolvedValue({ orders: [], errors: [], nextToken: "" });
  await act(async () => { await client.invalidateQueries({ queryKey: ["dingo", "markets", "splash", "account"] }); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(button("Review Splash transaction").dataset.draftKey).toBe(draft);
  const order = await vi.mocked(readSplashOrder)("fixture");
  await act(async () => { client.setQueryData(["dingo", "markets", "splash", "account", wallet.changeAddress, ""], { orders: [order], errors: [], nextToken: "" }); });
  vi.mocked(readSplashOrders).mockRejectedValue(new Error("offline"));
  await act(async () => { await client.invalidateQueries({ queryKey: ["dingo", "markets", "splash", "account"] }); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(host.querySelectorAll(".market-card")).toHaveLength(1); expect(host.textContent).toContain("Refresh failed: offline");
});
