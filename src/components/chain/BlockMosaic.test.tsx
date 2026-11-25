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

it("decodes a Dijkstra transaction in the block mosaic", async () => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const tx_hash = "87f8a7c62227c5067452770d5525b42a79a0a74a611ce000d9d409e51cd8233f";
  const cbor = "84a500d9010281825820cc0b4eb7d9626bf7c82ca62e6b747eb706e19a55c04cfadfc466c0c014c37bac00018182581d602ef18470cd9fd5d5f981632e897cd254e69f70bb33670e1afc2dae4a1a5c2b1d9f021a0002a465031a0032fc3e075820f53914486ac851e2f40a993c9e40423b5c01e8e1f939104d82a9c10952b141a2a100d9010281825820547664a961e3383dd9dfddd3236244f03d79c673e7877dd3a3586f679c96c7995840624f9fa35f205b55349c9749a7d303ac626b38768e0faeee40430c1bd6b94b73393d489fac5e4aa91e052894fd5ddff8b503e5114c28934f24c1d0c919e49c08d90103a100a101a36974696d657374616d706a313739353631393437346b73657175656e63655f6e6f633639356d6162736f6c7574655f736c6f746733333337383734f5";
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ tx_hash, cbor }]), { status: 200 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}>
      <BlockMosaic hash={"22".repeat(32)} total={1} />
    </QueryClientProvider></MemoryRouter>));
    expect(container.textContent).toContain("1 transactions");
    expect(container.textContent).toContain("1 of 1 records loaded");
    expect(container.textContent).not.toContain("undecodable");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.unstubAllGlobals();
  }
});
