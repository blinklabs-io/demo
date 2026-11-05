import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import Experiences from "./Experiences";
vi.mock("../components/explorer/ChainSnapshot", () => ({ ChainSnapshot: () => null }));
vi.mock("../components/chain/BlockMosaic", () => ({ BlockMosaic: ({ hash }: { hash: string }) => <figure data-block={hash} /> }));
vi.mock("../lib/dingo/nodeHealth", () => ({ useNodeHealth: () => ({ data: { tipHash: "22".repeat(32), tipHeight: 2, tipEpoch: 1 } }) }));

it("drops a pinned visual when its recent-window cache is cleared and loads canonical activity again", async () => {
  notifyManager.setScheduler(queueMicrotask);
  const hash = (n: number) => n.toString(16).padStart(64, "0");
  const block = (height: number) => ({ hash: hash(height), previous_block: height > 1 ? hash(height - 1) : "", height, tx_count: 1 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  client.setQueryData(["dingo", "recent-blocks"], { blocks: [block(1)], incomplete: false });
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation((url) => String(url).endsWith("/latest")
    ? new Promise<Response>((yes) => { resolve = yes; })
    : Promise.resolve(new Response(JSON.stringify([block(1)]), { status: 200 })));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><Experiences /></QueryClientProvider></MemoryRouter>));
    expect(container.querySelector("figure")?.getAttribute("data-block")).toBe(hash(1));
    await act(async () => { await client.resetQueries({ queryKey: ["dingo", "recent-blocks"] }); });
    expect(container.querySelector("figure")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify(block(2)), { status: 200 })));
    expect(container.querySelector("figure")?.getAttribute("data-block")).toBe(hash(2));
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

it("refreshes a stale cached window before pinning the automatic block visual", async () => {
  notifyManager.setScheduler(queueMicrotask);
  const block = (height: number) => ({ hash: height.toString(16).padStart(64, "0"), previous_block: "", height, tx_count: 1 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["dingo", "recent-blocks"], { blocks: [block(1)], incomplete: false }, { updatedAt: 1 });
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise<Response>((yes) => { resolve = yes; }));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><Experiences /></QueryClientProvider></MemoryRouter>));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector("figure")).toBeNull();
    await act(async () => resolve(new Response(JSON.stringify(block(2)), { status: 200 })));
    expect(container.querySelector("figure")?.getAttribute("data-block")).toBe(block(2).hash);
    client.setQueryData(["dingo", "recent-blocks"], { blocks: [block(3)], incomplete: false });
    await act(async () => Promise.resolve());
    expect(container.querySelector("figure")?.getAttribute("data-block")).toBe(block(2).hash);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
