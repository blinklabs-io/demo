import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import AssetDetail from "./AssetDetail";

vi.mock("../../components/chain/AssetDistribution", () => ({
  AssetDistribution: () => <section>Ownership distribution</section>,
}));
it("removes ownership and supply from a cached asset after an authoritative not-found response", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["dingo", "asset", "asset"];
  client.setQueryData(key, {
    asset: "asset", policy_id: "policy", asset_name: "01", asset_name_ascii: "Example token",
    fingerprint: "fingerprint", quantity: "100", initial_mint_tx_hash: "11".repeat(32), mint_or_burn_count: 1, onchain_metadata: null,
  });
  vi.mocked(fetch).mockResolvedValue(new Response('{"message":"Not found"}', { status: 404, headers: { "Content-Type": "application/json" } }));
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/asset/asset"]}><Routes><Route path="/asset/:assetId" element={<AssetDetail />} /></Routes></MemoryRouter></QueryClientProvider>));
    expect(container.textContent).toContain("Ownership distribution");
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    expect(client.getQueryData(key)).toBeDefined();
    expect(container.textContent).toContain("Asset not found.");
    expect(container.textContent).not.toContain("Ownership distribution");
    expect(container.textContent).not.toContain("Example token");
    expect(container.textContent).not.toContain("Issued supply");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
