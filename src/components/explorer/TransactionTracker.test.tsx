import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { TransactionTracker } from "./TransactionTracker";
import { readTrackingSnapshot } from "../../lib/explorer/transactionTracking";
import { useSubmissionStore } from "../../stores/submissionStore";
import { useMempoolStore } from "../../stores/mempoolStore";
vi.mock("../../lib/explorer/transactionTracking", async (original) => ({
  ...(await original<
    typeof import("../../lib/explorer/transactionTracking")
  >()),
  readTrackingSnapshot: vi.fn(),
}));
const hash = "11".repeat(32),
  block = "22".repeat(32);
const tip = { height: 103, slot: 1000, hash: "33".repeat(32) };
const inclusion = {
  hash,
  block,
  block_height: 100,
  block_time: 1700000000,
  valid_contract: true,
};
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  notifyManager.setScheduler(queueMicrotask);
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSubmissionStore.setState({ receipts: new Map() });
  useMempoolStore.setState({ status: "live", pendingTxs: new Map() });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.useRealTimers();
});
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TransactionTracker hash={hash} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function check() {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Check again")!
      .click(),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
it("tracks local submission through mempool and inclusion, then removes confirmations after rollback", async () => {
  useSubmissionStore.getState().record(hash, 1100);
  useMempoolStore.setState({
    pendingTxs: new Map([
      [
        hash,
        {
          hash,
          fee: 1n,
          totalOutputLovelace: 1n,
          inputCount: 1,
          outputCount: 1,
          seenAt: Date.now(),
        },
      ],
    ]),
  });
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip,
    inclusion: null,
    depth: null,
  });
  await render();
  expect(host.textContent).toContain("Observed in mempool");
  expect(host.textContent).toContain("Accepted by Dingo in this tab");
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip,
    inclusion,
    depth: 4,
  });
  await check();
  expect(host.textContent).toContain("4 including the containing block");
  expect(
    host.querySelector(`a[href="/explorer/block/${block}?network=preview"]`),
  ).not.toBeNull();
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip: { ...tip, height: 99 },
    inclusion: null,
    depth: null,
  });
  await act(async () => {
    useMempoolStore.setState({ pendingTxs: new Map() });
    await client.resetQueries({ queryKey: ["dingo", "transaction-tracker"] });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(host.textContent).not.toContain("4 including");
  expect(host.textContent).toContain("Awaiting chain evidence");
});

it("removes stale success when reads fail, retries the actual control and explains failed scripts", async () => {
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip,
    inclusion,
    depth: 4,
  });
  await render();
  vi.mocked(readTrackingSnapshot).mockRejectedValue(new Error("API offline"));
  await check();
  expect(host.textContent).toContain("Tracking unavailable");
  expect(host.textContent).not.toContain("4 including");
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip,
    inclusion: { ...inclusion, valid_contract: false },
    depth: 4,
  });
  await check();
  expect(host.textContent).toContain("Script validation failed");
  expect(host.textContent).toContain("intended actions were not applied");
});

it("retains an observed validity bound after eviction and reports expiry without inferring rejection", async () => {
  useMempoolStore.setState({
    pendingTxs: new Map([
      [
        hash,
        {
          hash,
          fee: 1n,
          totalOutputLovelace: 1n,
          inputCount: 1,
          outputCount: 1,
          seenAt: Date.now(),
          validUntil: 1001,
        },
      ],
    ]),
  });
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip,
    inclusion: null,
    depth: null,
  });
  await render();
  expect(host.textContent).toContain("Valid before slot 1,001");
  await act(async () => useMempoolStore.setState({ pendingTxs: new Map() }));
  vi.mocked(readTrackingSnapshot).mockResolvedValue({
    tip: { ...tip, slot: 1001 },
    inclusion: null,
    depth: null,
  });
  await check();
  expect(host.textContent).toContain("Validity window ended");
});
