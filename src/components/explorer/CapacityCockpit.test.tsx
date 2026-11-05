import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { getSyncClient } from "../../lib/dingo/utxorpc/streaming";
import { hexToBytes } from "../../lib/dingo/utxorpc/bytes";
import { CapacityCockpit } from "./CapacityCockpit";

vi.mock("../../lib/dingo/utxorpc/streaming", () => ({
  getSyncClient: vi.fn(),
}));
afterEach(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
const latest = {
  hash: "11".repeat(32),
  previous_block: "22".repeat(32),
  height: 102,
  slot: 42,
  epoch: 10,
  time: 1800000000,
  tx_count: 3,
  size: 1000,
};
const older = {
  ...latest,
  hash: latest.previous_block,
  previous_block: "",
  height: 101,
  slot: 41,
  size: 500,
};
const header = `828a${"00".repeat(6)}1903840000820b0040`;
function bytes(memory: number, steps: number) {
  return hexToBytes(
    `85${header}8081a105818400000082${memory.toString(16).padStart(2, "0")}${steps.toString(16).padStart(2, "0")}a080`,
  );
}

it("loads only the selected block’s exact budgets, marks memory or steps full, and reuses epoch limits", async () => {
  notifyManager.setScheduler(queueMicrotask);
  const fetchBlock = vi.fn(async ({ hash }: { hash: string }) => ({
    nativeBytes: hash === latest.hash ? bytes(20, 1) : bytes(1, 20),
    parsedBlock: { header: { hash: hexToBytes(hash) } },
  }));
  vi.mocked(getSyncClient).mockReturnValue({
    fetchBlock,
  } as unknown as ReturnType<typeof getSyncClient>);
  vi.mocked(fetch).mockImplementation(async (url) => {
    const path = String(url);
    return new Response(
      JSON.stringify(
        path.endsWith("/blocks/latest")
          ? latest
          : path.includes("/previous?")
            ? [older]
            : {
                max_block_size: 90000,
                protocol_major_ver: 11,
                max_block_ex_mem: "20",
                max_block_ex_steps: "20",
              },
      ),
      { status: 200 },
    );
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <CapacityCockpit />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
    expect(fetchBlock).toHaveBeenCalledTimes(1);
    expect(fetchBlock).toHaveBeenCalledWith({
      hash: latest.hash,
      slot: latest.slot,
    });
    expect(
      container.querySelectorAll(".capacity-gauges .instrument-gauge"),
    ).toHaveLength(3);
    expect(container.querySelector(".capacity-status")?.textContent).toContain(
      "Full · execution memory",
    );
    expect(container.querySelector(".gauge-red title")?.textContent).toContain(
      "Execution memory: 100.0 percent",
    );
    expect(container.querySelectorAll(".capacity-history button")).toHaveLength(
      2,
    );
    expect(container.textContent).toContain(
      "Bars show serialized block size, including its header.",
    );
    const oldButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label^="Block ${older.height},"]`,
    )!;
    await act(async () => oldButton.click());
    expect(fetchBlock).toHaveBeenCalledTimes(2);
    expect(fetchBlock).toHaveBeenLastCalledWith({
      hash: older.hash,
      slot: older.slot,
    });
    expect(container.querySelector(".capacity-status")?.textContent).toContain(
      "Full · execution steps",
    );
    expect(container.querySelector(".gauge-red title")?.textContent).toContain(
      "Execution steps: 100.0 percent",
    );
    expect(oldButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector(".capacity-selection a")?.getAttribute("href"),
    ).toContain(`/explorer/block/${older.hash}`);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).endsWith("/parameters")),
    ).toHaveLength(1);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `button[aria-label^="Block ${latest.height},"]`,
        )!
        .click(),
    );
    expect(fetchBlock).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".capacity-status")?.textContent).toContain(
      "Full · execution memory",
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});

it("keeps the summary history usable when exact execution data is unavailable", async () => {
  notifyManager.setScheduler(queueMicrotask);
  const fetchBlock = vi.fn(async () => {
    throw new Error("Native block unavailable");
  });
  vi.mocked(getSyncClient).mockReturnValue({
    fetchBlock,
  } as unknown as ReturnType<typeof getSyncClient>);
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/blocks/latest")
            ? latest
            : String(url).includes("/previous?")
              ? [older]
              : {
                  max_block_size: 90000,
                  protocol_major_ver: 11,
                  max_block_ex_mem: "20",
                  max_block_ex_steps: "20",
                },
        ),
        { status: 200 },
      ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <CapacityCockpit />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Native block unavailable",
    );
    expect(container.querySelectorAll(".capacity-history button")).toHaveLength(
      2,
    );
    expect(container.querySelectorAll(".capacity-gauges")).toHaveLength(0);
    expect(fetchBlock).toHaveBeenCalledTimes(1);
    fetchBlock.mockResolvedValueOnce({
      nativeBytes: bytes(20, 1),
      parsedBlock: { header: { hash: hexToBytes(latest.hash) } },
    } as never);
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry block resources",
    )!;
    await act(async () => retry.click());
    expect(
      container.querySelectorAll(".capacity-gauges .instrument-gauge"),
    ).toHaveLength(3);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});
