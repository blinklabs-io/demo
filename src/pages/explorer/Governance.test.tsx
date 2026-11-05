import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ProposalDetail } from "./Governance";

vi.mock("../../components/explorer/HolderAnswer", () => ({
  HolderAnswer: () => <section>Holder answer form</section>,
}));
vi.mock("../../components/explorer/HolderResults", () => ({
  HolderResults: () => <section>Holder answer results</section>,
}));
vi.mock("../../components/explorer/ProposalVoting", () => ({
  ProposalVoting: () => <section>DRep vote form</section>,
}));
vi.mock("../../components/chain/GovernanceChamber", () => ({
  GovernanceChamber: () => <section>Voting chamber</section>,
}));

it.each([404, 503])("keeps proposal actions consistent with an indexed record after refresh status %s", async (status) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const key = ["dingo", "proposal", "identity"];
  client.setQueryData(key, {
    id: "identity", tx_hash: "11".repeat(32), cert_index: 0, governance_type: "info_action",
    deposit: "1000000", expiration: 100, return_address: "stake", governance_description: {},
    ratified_epoch: null, enacted_epoch: null, dropped_epoch: null, expired_epoch: null,
  });
  vi.mocked(fetch).mockResolvedValue(new Response('{"message":"Unavailable"}', { status, headers: { "Content-Type": "application/json" } }));
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/proposal/identity"]}>
          <Routes><Route path="/proposal/:id" element={<ProposalDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ));
    expect(container.textContent).toContain("DRep vote form");
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(client.getQueryData(key)).toBeDefined();
    for (const child of ["Holder answer form", "Holder answer results", "DRep vote form", "Voting chamber"]) {
      if (status === 404) expect(container.textContent).not.toContain(child);
      else expect(container.textContent).toContain(child);
    }
    expect(container.textContent).toContain(status === 404 ? "Proposal not found." : "Showing previously loaded data");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
