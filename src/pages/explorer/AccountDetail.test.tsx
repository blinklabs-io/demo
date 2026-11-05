import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import AccountDetail from "./AccountDetail";
import DRepDetail from "./DRepDetail";

vi.mock("../../components/chain/StakeJourney", () => ({
  StakeJourney: () => <section>Stake rewards journey</section>,
}));
vi.mock("../../components/explorer/PaginatedList", () => ({
  PaginatedList: () => <section>Indexed child records</section>,
}));
it.each([["account", 404], ["drep", 404], ["drep", 503]] as const)("handles cached %s records after status %s", async (kind, status) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["dingo", kind, "identity"];
  client.setQueryData(key, kind === "account" ? {
    stake_address: "identity", active: true, active_epoch: 1, controlled_amount: "1000000",
    rewards_sum: "100", withdrawals_sum: "0", reserves_sum: "0", treasury_sum: "0",
    withdrawable_amount: "100", pool_id: null, drep_id: null, registered: true,
  } : { drep_id: "identity", hex: "00", amount: "1000000", active: true, active_epoch: 1, has_script: false, retired: false, expired: false, last_active_epoch: 1 });
  client.setQueryData([...key, "metadata"], {});
  vi.mocked(fetch).mockResolvedValue(new Response('{"message":"Not found"}', { status, headers: { "Content-Type": "application/json" } }));
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/entity/identity"]}><Routes><Route path={kind === "account" ? "/entity/:stakeAddress" : "/entity/:drepId"} element={kind === "account" ? <AccountDetail /> : <DRepDetail />} /></Routes></MemoryRouter></QueryClientProvider>));
    expect(container.textContent).toContain("Indexed child records");
    if (kind === "account") expect(container.textContent).toContain("Stake rewards journey");
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(client.getQueryData(key)).toBeDefined();
    if (status === 404) {
      expect(container.textContent).toContain(kind === "account" ? "Stake account not found." : "DRep not found.");
      expect(container.textContent).not.toContain("Indexed child records");
      expect(container.textContent).not.toContain("Stake rewards journey");
      expect(container.textContent).not.toContain("Delegated voting power");
    } else {
      expect(container.textContent).toContain("Showing previously loaded data");
      expect(container.textContent).toContain("Indexed child records");
      expect(container.querySelector('a[href="/wallet/delegate?drep=identity"]')).not.toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
