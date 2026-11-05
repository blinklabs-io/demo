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
const progress: HeaderHistoryProgress = {
  rows: [
    {
      hash: "11".repeat(32),
      parent: "00".repeat(32),
      height: 1,
      slot: 1,
      time: end - 86000,
      major: "11",
      minor: "69",
    },
  ],
  snapshot: { hash: "33".repeat(32), height: 3, slot: 3, time: end },
  cutoff: end - 86400,
  complete: false,
  cached: false,
  cachedRows: 0,
  total: 3,
};
async function render() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    }),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const recent = [{ hash: "33".repeat(32), height: 3, slot: 3, time: end }];
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
    await act(async () =>
      finish({
        ...progress,
        complete: true,
        rows: [
          ...progress.rows,
          { ...progress.rows[0], height: 2, hash: "22".repeat(32) },
          { ...progress.rows[0], height: 3, hash: "33".repeat(32), time: end },
        ],
      }),
    );
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
