import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import EpochDetail from "./EpochDetail";

it("loads and refreshes latest parameters independently of a failing block clock", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  const parameters = { epoch: 10, min_fee_a: 44, min_fee_b: 155381, max_block_size: 90112, max_tx_size: 16384, key_deposit: "2000000", pool_deposit: "500000000", a0: 0.3, rho: 0.003, tau: 0.2, protocol_major_ver: 11, protocol_minor_ver: 0, min_pool_cost: "170000000" };
  let reads = 0;
  vi.mocked(fetch).mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith("/epochs/latest/parameters")) {
      reads++;
      return new Response(JSON.stringify({ ...parameters, protocol_minor_ver: reads - 1 }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response('{"message":"Clock unavailable"}', { status: 503, headers: { "Content-Type": "application/json" } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const container = document.createElement("div");
  const actualRoot = createRoot(container);
  try {
    await act(async () => actualRoot.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/epoch"]}><Routes><Route path="/epoch" element={<EpochDetail />} /></Routes></MemoryRouter></QueryClientProvider>));
    expect(container.textContent).toContain("11.0");
    expect(reads).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(reads).toBe(2);
    expect(container.textContent).toContain("11.1");
  } finally {
    await act(async () => { actualRoot.unmount(); });
    client.clear();
    vi.useRealTimers();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
