import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import PoolDetail from "./PoolDetail";

it("delegates to the canonical pool ID when viewing a hex alias and preserves cached actions on transient errors", async () => {
  const alias = "11".repeat(28), canonical = "pool1canonical";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["dingo", "pool", alias];
  client.setQueryData(key, { pool_id: canonical, hex: alias, vrf_key: "00", blocks_minted: 1, blocks_epoch: 1, live_stake: "1000000", live_saturation: 0.1, live_delegators: 1, active_stake: "1000000", declared_pledge: "0", margin_cost: 0, fixed_cost: "0", reward_account: "stake1fixture", owners: [] });
  client.setQueryData([...key, "metadata"], {});
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/pool/${alias}`]}><Routes><Route path="/pool/:poolId" element={<PoolDetail />} /></Routes></MemoryRouter></QueryClientProvider>));
    const href = `/wallet/delegate?pool=${canonical}&network=preview`;
    expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503, headers: { "Content-Type": "application/json" } }));
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 404, headers: { "Content-Type": "application/json" } }));
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(container.querySelector(`a[href="${href}"]`)).toBeNull();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
