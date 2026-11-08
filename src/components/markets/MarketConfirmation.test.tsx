import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketConfirmation } from "./MarketTransaction";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { useWalletStore } from "../../stores/walletStore";
vi.mock("../NetworkLink", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("../../lib/dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../../lib/dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));
vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 }, DINGO_CONFIG: {} }));
const hash = "11".repeat(32),
  block = "22".repeat(32);
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  refresh: () => Promise<void>;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  notifyManager.setScheduler(queueMicrotask);
  vi.mocked(blockfrostFetch).mockReset();
  refresh = vi.fn(async () => {});
  useWalletStore.setState({ refreshBalance: refresh });
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.useRealTimers();
});
function Tracking() {
  const [current, setCurrent] = useState(hash);
  return (
    <MarketConfirmation tracking={{ hash: current, submitted: setCurrent }} />
  );
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Tracking />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  );
  if (!button) throw new Error(`Missing ${text}`);
  await act(async () => button.click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
it("polls a real 404 as pending and then confirms only a valid-contract inclusion", async () => {
  vi.mocked(blockfrostFetch)
    .mockRejectedValueOnce(new BlockfrostError("Not found", 404, "/txs/hash"))
    .mockResolvedValueOnce({ hash, block, valid_contract: true });
  await render();
  expect(host.textContent).toContain("waiting for inclusion");
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(host.textContent).toContain("Confirmed on Preprod");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(blockfrostFetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(blockfrostFetch).toHaveBeenCalledTimes(2);
});
it("reports invalid-contract inclusion as failure and refreshes collateral balance", async () => {
  vi.mocked(blockfrostFetch).mockResolvedValueOnce({
    hash,
    block,
    valid_contract: false,
  });
  await render();
  expect(host.textContent).toContain("Transaction failed on chain");
  expect(host.textContent).not.toContain("Confirmed on Preprod");
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("retries a transport failure without claiming confirmation", async () => {
  vi.mocked(blockfrostFetch)
    .mockRejectedValueOnce(new Error("Dingo unavailable"))
    .mockResolvedValueOnce({ hash, block, valid_contract: true });
  await render();
  expect(host.textContent).toContain("Confirmation unavailable");
  expect(refresh).not.toHaveBeenCalled();
  await click("Retry confirmation");
  expect(host.textContent).toContain("Confirmed on Preprod");
});
it("lets a pending transaction stop tracking while explaining it can still confirm", async () => {
  vi.mocked(blockfrostFetch).mockRejectedValue(
    new BlockfrostError("Not found", 404, "/txs/hash"),
  );
  await render();
  expect(host.textContent).toContain(
    "does not cancel this transaction. It may still confirm",
  );
  await click("Stop tracking this transaction");
  expect(host.textContent).toBe("");
});
