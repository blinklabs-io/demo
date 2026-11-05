import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { getSyncClient } from "../../lib/dingo/utxorpc/streaming";
import { hexToBytes } from "../../lib/dingo/utxorpc/bytes";
import { BlockCapacity } from "./BlockCapacity";
import { BlockHeaderVersion } from "./BlockHeaderVersion";
import { RecentHeaderVersions } from "./RecentHeaderVersions";

vi.mock("../../lib/dingo/utxorpc/streaming", () => ({ getSyncClient: vi.fn() }));
afterEach(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));

it.each(["full", "missing", "pre-plutus"])("shares the header read and reports memory-full or unavailable instead of byte-only capacity (mode=%s)", async (mode) => {
  notifyManager.setScheduler(queueMicrotask);
  const hash = "11".repeat(32);
  const missing = mode === "missing", prePlutus = mode === "pre-plutus";
  const header = `828a${"00".repeat(6)}1903840000820b0040`;
  const legacy = `828f${"00".repeat(7)}190384${"00".repeat(5)}040040`;
  const nativeBytes = hexToBytes(prePlutus ? `84${legacy}8081a0a0` : `85${header}8081a1058184000000821903e801a080`);
  const fetchBlock = vi.fn(async () => ({ nativeBytes, parsedBlock: { header: { hash: hexToBytes(hash) } } }));
  vi.mocked(getSyncClient).mockReturnValue({ fetchBlock } as unknown as ReturnType<typeof getSyncClient>);
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    max_block_size: 90000,
    protocol_major_ver: prePlutus ? 4 : 11,
    max_block_ex_mem: missing ? undefined : prePlutus ? "0" : "1000",
    max_block_ex_steps: prePlutus ? "0" : "2000",
  }), { status: 200 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}>
      <BlockHeaderVersion hash={hash} slot={42} />
      <BlockCapacity hash={hash} slot={42} epoch={10} />
      <RecentHeaderVersions blocks={[{ hash, slot: 42, height: 1, time: 1000 }]} />
    </QueryClientProvider></MemoryRouter>));
    expect(fetchBlock).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".header-version")?.textContent).toContain(prePlutus ? "4.0" : "11.0");
    if (missing) {
      expect(container.textContent).toContain("Dingo did not return valid block execution limits.");
      expect(container.querySelector('[aria-label="Block resource capacity"]')).toBeNull();
    } else if (prePlutus) {
      expect(container.textContent).toContain("Execution memory: not applicable in this epoch.");
      expect(container.querySelector(".gauge-violet title")?.textContent).toContain("1.0 percent");
    } else {
      expect(container.querySelector(".gauge-red title")?.textContent).toContain("Block capacity used: 100.0 percent");
      expect(container.textContent).toContain("Full · execution memory");
      expect(container.querySelector('[role="meter"][aria-label="Execution memory"]')?.getAttribute("aria-valuenow")).toBe("100");
      expect(container.querySelector('[role="meter"][aria-label="Body bytes"]')?.getAttribute("aria-valuenow")).toBe("1");
    }
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});
