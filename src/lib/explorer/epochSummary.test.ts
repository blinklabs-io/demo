import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { blockfrostFetch } from "../dingo/blockfrost";
import { clearEpochSummaryCache, epochSummaryQuery } from "./epochSummary";
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
const DAY = 86400000;
const summary = {
  epoch: 10,
  start_time: 1000000,
  end_time: 1086400,
  first_block_time: 1000001,
  last_block_time: 1086390,
  block_count: 3000,
  tx_count: 2000,
  output: "123456789",
  fees: "1234",
  active_stake: null,
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(blockfrostFetch).mockResolvedValue(summary);
});
it.each([true, false])(
  "caches completed epochs for seven days and current epochs for ten minutes (completed=%s)",
  async (completed) => {
    vi.useFakeTimers();
    const client = new QueryClient();
    try {
      const options = epochSummaryQuery(10, completed ? 11 : 10),
        observedAt = Date.now();
      expect(await client.fetchQuery(options)).toEqual({
        ...summary,
        observedAt,
        completed,
      });
      await vi.advanceTimersByTimeAsync(completed ? 6 * DAY : 9 * 60000);
      await client.fetchQuery(options);
      expect(blockfrostFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(completed ? DAY + 1 : 60001);
      await client.fetchQuery(options);
      expect(blockfrostFetch).toHaveBeenCalledTimes(2);
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  },
);
it("preserves the original expiry across reloads instead of extending cache freshness", async () => {
  vi.useFakeTimers();
  const first = new QueryClient(),
    second = new QueryClient();
  try {
    const original = await first.fetchQuery(epochSummaryQuery(10, 11));
    first.clear();
    await vi.advanceTimersByTimeAsync(DAY);
    expect(await second.fetchQuery(epochSummaryQuery(10, 11))).toEqual(
      original,
    );
    expect(blockfrostFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * DAY);
    await second.fetchQuery(epochSummaryQuery(10, 11));
    expect(blockfrostFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DAY + 1);
    await second.fetchQuery(epochSummaryQuery(10, 11));
    expect(blockfrostFetch).toHaveBeenCalledTimes(2);
  } finally {
    first.clear();
    second.clear();
    vi.useRealTimers();
  }
});
it("does not promote a cached partial epoch into a completed snapshot", async () => {
  const first = new QueryClient(),
    second = new QueryClient();
  try {
    expect((await first.fetchQuery(epochSummaryQuery(10, 10))).completed).toBe(
      false,
    );
    first.clear();
    vi.mocked(blockfrostFetch).mockResolvedValue({
      ...summary,
      tx_count: 3000,
    });
    expect(await second.fetchQuery(epochSummaryQuery(10, 11))).toMatchObject({
      tx_count: 3000,
      completed: true,
    });
    expect(blockfrostFetch).toHaveBeenCalledTimes(2);
  } finally {
    first.clear();
    second.clear();
  }
});
it("bypasses stored summaries on explicit invalidation and after rollback clearing", async () => {
  const client = new QueryClient(),
    next = new QueryClient();
  try {
    const options = epochSummaryQuery(10, 11);
    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    await client.fetchQuery(options);
    expect(blockfrostFetch).toHaveBeenCalledTimes(2);
    clearEpochSummaryCache();
    await next.fetchQuery(options);
    expect(blockfrostFetch).toHaveBeenCalledTimes(3);
  } finally {
    client.clear();
    next.clear();
  }
});
it("ignores malformed stored summaries and refuses mismatched API epochs", async () => {
  const first = new QueryClient(),
    second = new QueryClient();
  try {
    await first.fetchQuery(epochSummaryQuery(10, 11));
    first.clear();
    const key = localStorage.key(0)!,
      saved = JSON.parse(localStorage.getItem(key)!);
    saved.rows[0].output = "invalid";
    localStorage.setItem(key, JSON.stringify(saved));
    await second.fetchQuery(epochSummaryQuery(10, 11));
    expect(blockfrostFetch).toHaveBeenCalledTimes(2);
    vi.mocked(blockfrostFetch).mockResolvedValue({ ...summary, epoch: 12 });
    await expect(second.fetchQuery(epochSummaryQuery(11, 12))).rejects.toThrow(
      "invalid epoch summary",
    );
  } finally {
    first.clear();
    second.clear();
  }
});
it("keeps persisted summaries through initial connection but clears them on an observed rollback", async () => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { useChainReconciliation } =
    await import("../chain/useChainReconciliation");
  const { useTipStore } = await import("../../stores/tipStore");
  const before = useTipStore.getState(),
    client = new QueryClient();
  await client.fetchQuery(epochSummaryQuery(10, 11));
  const key = localStorage.key(0)!;
  const host = document.createElement("div"),
    root = createRoot(host);
  function Harness() {
    useChainReconciliation();
    return null;
  }
  try {
    await act(async () =>
      root.render(
        createElement(QueryClientProvider, { client }, createElement(Harness)),
      ),
    );
    await act(async () =>
      useTipStore.setState((state) => ({
        lastAction: "connect",
        tip: null,
        revision: state.revision + 1,
      })),
    );
    expect(localStorage.getItem(key)).not.toBeNull();
    await act(async () =>
      useTipStore.setState((state) => ({
        lastAction: "undo",
        tip: null,
        revision: state.revision + 1,
      })),
    );
    expect(localStorage.getItem(key)).toBeNull();
    expect(blockfrostFetch).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    useTipStore.setState(before);
  }
});
