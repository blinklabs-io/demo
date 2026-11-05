import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { BlockMosaic } from "./BlockMosaic";

it("requests the first bounded mosaic page without an extra click", async () => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(fetch).mockResolvedValue(new Response("[]", { status: 200 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}>
      <BlockMosaic hash={"11".repeat(32)} total={100} />
    </QueryClientProvider></MemoryRouter>));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("count=40");
    expect(container.textContent).toContain("0 of 100 records loaded");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.unstubAllGlobals();
  }
});
