import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { HeaderVersionHistory } from "./HeaderVersionHistory";
import {
  loadHeaderHistory,
  type HeaderHistoryProgress,
} from "../../lib/explorer/headerHistory";
vi.mock("../../lib/explorer/headerHistory", () => ({
  loadHeaderHistory: vi.fn(),
}));
afterEach(() => vi.useRealTimers());
const end = 1800000000;
const systemStart = 1666656000;
const progress: HeaderHistoryProgress = {
  rows: [
    {
      hash: "11".repeat(32),
      parent: "00".repeat(32),
      height: 1,
      slot: end - 86000 - systemStart,
      time: end - 86000,
      major: "11",
      minor: "69",
    },
  ],
  snapshot: {
    hash: "33".repeat(32),
    height: 3,
    slot: end - systemStart,
    time: end,
  },
  cutoff: end - 86400,
  complete: false,
  cached: false,
  cachedRows: 0,
  total: 3,
};
const complete: HeaderHistoryProgress = {
  ...progress,
  complete: true,
  rows: [
    ...progress.rows,
    {
      ...progress.rows[0],
      parent: progress.rows[0].hash,
      height: 2,
      hash: "22".repeat(32),
      slot: end - 43000 - systemStart,
      time: end - 43000,
    },
    {
      ...progress.rows[0],
      parent: "22".repeat(32),
      height: 3,
      hash: "33".repeat(32),
      slot: end - systemStart,
      time: end,
    },
  ],
};
async function render() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    }),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const recent = [
    { hash: "33".repeat(32), height: 3, slot: end - systemStart, time: end },
  ];
  const paint = async (rows = recent) =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <HeaderVersionHistory recent={rows} />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
  await paint();
  return {
    host,
    paint,
    close: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
it("shows verified partial coverage, then marks a frozen full window complete", async () => {
  let finish!: (p: HeaderHistoryProgress) => void;
  vi.mocked(loadHeaderHistory).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { host, close } = await render();
  try {
    const call = vi.mocked(loadHeaderHistory).mock.calls[0][0]!;
    expect(host.textContent).toContain("Locating the 24-hour window");
    await act(async () => call.onProgress?.(progress));
    expect(host.textContent).toContain("1 / 3 headers verified");
    expect(host.textContent).not.toContain("complete 24 hours");
    expect(host.querySelector("progress")?.getAttribute("value")).toBe("1");
    await act(async () => finish(complete));
    expect(host.textContent).toContain("3 blocks · complete 24 hours");
  } finally {
    await close();
  }
});
it("does not restart an active scan on recent-block updates and cancels it when selecting the live window", async () => {
  vi.mocked(loadHeaderHistory).mockImplementation(() => new Promise(() => {}));
  const { host, paint, close } = await render();
  try {
    const signal = vi.mocked(loadHeaderHistory).mock.calls[0][0]?.signal;
    await paint([
      { hash: "44".repeat(32), height: 4, slot: 4, time: end + 20 },
    ]);
    expect(loadHeaderHistory).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    const live = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.startsWith("Latest "),
    )!;
    await act(async () => live.click());
    expect(signal?.aborted).toBe(true);
    expect(host.textContent).toContain("block list's headers");
  } finally {
    await close();
  }
});
it("keeps partial counts honest on failure and retries through an explicit action", async () => {
  vi.mocked(loadHeaderHistory).mockImplementation(async (options) => {
    options?.onProgress?.(progress);
    throw Error("History is not contiguous");
  });
  const { host, close } = await render();
  try {
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "not contiguous",
    );
    expect(host.textContent).not.toContain("complete 24 hours");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Retry 24-hour history",
    )!;
    await act(async () => retry.click());
    expect(loadHeaderHistory).toHaveBeenCalledTimes(2);
  } finally {
    await close();
  }
});
it("rechecks completion on refresh and discards an earlier run after failure", async () => {
  let fail!: (e: Error) => void;
  vi.mocked(loadHeaderHistory)
    .mockResolvedValueOnce(complete)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
  const { host, close } = await render();
  try {
    expect(host.textContent).toContain("complete 24 hours");
    const refresh = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Refresh ↻")!;
    await act(async () => refresh.click());
    expect(host.textContent).not.toContain("complete 24 hours");
    await act(async () => fail(new Error("Snapshot rolled back")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Snapshot rolled back",
    );
    expect(host.querySelector(".header-history-chart")).toBeNull();
    expect(host.textContent).not.toContain("Every block verified");
  } finally {
    await close();
  }
});
it("refreshes each completed window again after every minute", async () => {
  vi.useFakeTimers();
  vi.mocked(loadHeaderHistory).mockResolvedValue(complete);
  const { close } = await render();
  try {
    expect(loadHeaderHistory).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(loadHeaderHistory).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(loadHeaderHistory).toHaveBeenCalledTimes(3);
  } finally {
    await close();
  }
});
it("does not revive an orphaned snapshot when a new run fails before progress", async () => {
  vi.mocked(loadHeaderHistory)
    .mockResolvedValueOnce(complete)
    .mockRejectedValueOnce(new Error("Snapshot rolled back"));
  const { host, close } = await render();
  try {
    const refresh = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Refresh ↻")!;
    await act(async () => refresh.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Snapshot rolled back",
    );
    expect(host.querySelector(".header-history-chart")).toBeNull();
    expect(host.textContent).not.toContain("Every block verified");
  } finally {
    await close();
  }
});
it("preserves the inspected version and page across an automatic refresh", async () => {
  vi.useFakeTimers();
  const rows = Array.from({ length: 25 }, (_, i) => {
    const time = i === 24 ? end : progress.cutoff + 1000 + i * 3000;
    return {
      ...progress.rows[0],
      height: i + 1,
      hash: (i + 1).toString(16).padStart(64, "0"),
      parent: i.toString(16).padStart(64, "0"),
      slot: time - systemStart,
      time,
    };
  });
  const window = { ...complete, rows, snapshot: rows[24], total: 25 };
  let finish!: (data: HeaderHistoryProgress) => void;
  vi.mocked(loadHeaderHistory)
    .mockResolvedValueOnce(window)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const { host, close } = await render();
  try {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".header-node-legend button")!
        .click(),
    );
    const next = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Next →",
    )!;
    await act(async () => next.click());
    expect(host.querySelector(".header-history-pages")?.textContent).toContain(
      "2 / 3",
    );
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(host.querySelector(".header-history-chart")).toBeNull();
    await act(async () => finish(window));
    expect(
      host.querySelector(".header-history-records .eyebrow")?.textContent,
    ).toBe("Header 11.69");
    expect(host.querySelector(".header-history-pages")?.textContent).toContain(
      "2 / 3",
    );
    expect(
      host
        .querySelector(".header-node-legend button")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await close();
  }
});
it.each(["success", "failure"])(
  "ignores cancelled progress and late %s after a newer window completes",
  async (settlement) => {
    let finish!: (data: HeaderHistoryProgress) => void;
    let fail!: (error: Error) => void;
    vi.mocked(loadHeaderHistory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      )
      .mockResolvedValueOnce(complete);
    const { host, close } = await render();
    try {
      const old = vi.mocked(loadHeaderHistory).mock.calls[0][0]!;
      const button = (text: string) =>
        [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
          b.textContent?.startsWith(text),
        )!;
      await act(async () => button("Latest ").click());
      expect(old.signal?.aborted).toBe(true);
      await act(async () => button("24 hours").click());
      expect(host.querySelector(".header-history-chart")).not.toBeNull();
      expect(host.textContent).toContain("3 blocks · complete 24 hours");
      await act(async () => old.onProgress?.(progress));
      expect(host.querySelector(".header-history-chart")).not.toBeNull();
      expect(host.textContent).toContain("3 blocks · complete 24 hours");
      await act(async () =>
        settlement === "success"
          ? finish(progress)
          : fail(new Error("Old request failed")),
      );
      expect(host.querySelector(".header-history-chart")).not.toBeNull();
      expect(host.textContent).toContain("3 blocks · complete 24 hours");
      expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
      await close();
    }
  },
);
