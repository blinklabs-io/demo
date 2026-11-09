import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WalletBridge from "./WalletBridge";
import { readBridgeSettings, readBridgeTransfer } from "../../lib/reactor/api";
import { readTransactionConfirmation } from "../../lib/dingo/transactionConfirmation";
import { useWalletStore } from "../../stores/walletStore";
import type { BridgeSettings } from "../../lib/reactor/plan";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "prime-testnet", label: "Prime Testnet", networkMagic: 3311 }, DINGO_CONFIG: {} }));
vi.mock("../../lib/reactor/api", async (original) => ({ ...await original<typeof import("../../lib/reactor/api")>(), readBridgeSettings: vi.fn(), readBridgeTransfer: vi.fn() }));
vi.mock("../../lib/dingo/transactionConfirmation", async (original) => ({ ...await original<typeof import("../../lib/dingo/transactionConfirmation")>(), readTransactionConfirmation: vi.fn() }));
const hash = "ab".repeat(32), second = "cd".repeat(32);
let root: Root, host: HTMLDivElement, client: QueryClient;
let settings: BridgeSettings;
beforeEach(() => {
  vi.clearAllMocks();
  notifyManager.setScheduler(queueMicrotask);
  settings = { minimum: 1000000n, maximum: 1000000000000n, fee: 1000010n, destinations: ["vector", "nexus"], paused: false };
  vi.mocked(readBridgeSettings).mockImplementation(async () => settings);
  vi.mocked(readBridgeTransfer).mockResolvedValue(null);
  vi.mocked(readTransactionConfirmation).mockImplementation(async (requested) => ({ hash: requested, block: "ef".repeat(32), valid_contract: true }));
  useWalletStore.setState({ status: "connected", walletApi: {} as Cip30WalletApi, refreshBalance: async () => {}, changeAddress: "address", rewardAddress: null });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove();
  vi.useRealTimers(); notifyManager.setScheduler((fn) => setTimeout(fn, 0));
});
async function render(search = "") {
  const router = createMemoryRouter([{ path: "/wallet/bridge", element: <WalletBridge /> }], { initialEntries: ["/wallet/bridge?network=prime-testnet" + search] });
  await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
  return router;
}
const review = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Review transaction")!;
async function input(label: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("keeps Prime inclusion separate from Reactor delivery", async () => {
  await render("&hash=" + hash);
  expect(host.textContent).toContain("Confirmed on Prime Testnet");
  expect(host.textContent).toContain("has not indexed this Prime transaction");
  expect(host.textContent).not.toContain("Delivered on Nexus Testnet");
  vi.mocked(readBridgeTransfer).mockResolvedValue({ hash, destination: "nexus", status: "ExecutedOnDestination", destinationHash: "0x" + second, isRefund: false });
  await act(async () => { await client.invalidateQueries({ queryKey: ["reactor", "prime-testnet", "transfer"] }); });
  expect(host.textContent).toContain("Delivered on Nexus Testnet");
  expect(host.textContent).toContain("Confirmed on Prime Testnet");
  expect(host.querySelectorAll(".bridge-stages .complete")).toHaveLength(5);
});
it.each([false, true])("does not label destination failure or refund as delivered: refund %s", async (isRefund) => {
  vi.mocked(readBridgeTransfer).mockResolvedValue({ hash, destination: "nexus", status: "FailedToExecuteOnDestination", destinationHash: null, isRefund });
  await render("&hash=" + hash);
  expect(host.textContent).toContain(isRefund ? "Refund recorded by Reactor" : "Destination execution failed");
  expect(host.textContent).not.toContain("Delivered on Nexus Testnet");
  expect(host.textContent).not.toContain("Refund · Refund");
});
it.each(["paused", "disabled", "unavailable"])("blocks review when bridge conditions are %s", async (condition) => {
  if (condition === "paused") settings.paused = true;
  if (condition === "disabled") settings.destinations = [];
  if (condition === "unavailable") vi.mocked(readBridgeSettings).mockRejectedValue(new Error("Unavailable"));
  await render(); await input("Amount to bridge", "10"); await input("Bridge destination address", "addr1example");
  expect(review().disabled).toBe(true);
  expect(host.textContent).toContain(condition === "paused" ? "transfers paused" : condition === "disabled" ? "currently unavailable" : "Building is unavailable");
});
it("ignores an invalid tracking hash for transaction review and synchronizes the input after navigation", async () => {
  const router = await render("&hash=invalid");
  await input("Amount to bridge", "10"); await input("Bridge destination address", "addr1example");
  expect(review().disabled).toBe(false);
  expect(readBridgeTransfer).not.toHaveBeenCalled();
  await act(async () => { await router.navigate("?network=prime-testnet&hash=" + hash); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Prime transaction hash"]')!.value).toBe(hash);
  await act(async () => { await router.navigate("?network=prime-testnet&hash=" + second); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Prime transaction hash"]')!.value).toBe(second);
  await act(async () => { await router.navigate(-1); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Prime transaction hash"]')!.value).toBe(hash);
});
it("continues polling an unfinished refund and stops when it is delivered", async () => {
  vi.useFakeTimers();
  vi.mocked(readBridgeTransfer).mockResolvedValue({ hash, destination: "nexus", status: "SubmittedToDestination", destinationHash: null, isRefund: true });
  await render("&hash=" + hash);
  expect(host.textContent).toContain("Refund recorded by Reactor · Sent to destination");
  expect(host.querySelectorAll(".bridge-stages .complete")).toHaveLength(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(readBridgeTransfer).toHaveBeenCalledTimes(2);
  vi.mocked(readBridgeTransfer).mockResolvedValue({ hash, destination: "nexus", status: "ExecutedOnDestination", destinationHash: "0x" + second, isRefund: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(readBridgeTransfer).toHaveBeenCalledTimes(3);
  expect(host.textContent).toContain("Refund recorded by Reactor · Delivered");
  expect(host.querySelectorAll(".bridge-stages .complete")).toHaveLength(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(readBridgeTransfer).toHaveBeenCalledTimes(3);
});

it("clears a lookup error when navigation selects a valid transfer", async () => {
  const router = await render();
  await input("Prime transaction hash", "invalid");
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(host.textContent).toContain("Enter a 64-character Prime transaction hash.");
  await act(async () => { await router.navigate("?network=prime-testnet&hash=" + hash); });
  expect(host.textContent).not.toContain("Enter a 64-character Prime transaction hash.");
});
