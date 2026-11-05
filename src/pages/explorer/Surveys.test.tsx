import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { BlockfrostError } from "../../lib/dingo/blockfrost";
import { SurveyDetail } from "./Surveys";

const boundary = vi.hoisted(() => ({ status: 404 }));
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: () => ({ data: { tipEpoch: 10 } }),
}));
vi.mock("../../lib/surveys/data", async (original) => ({
  ...await original<typeof import("../../lib/surveys/data")>(),
  loadSurvey: async () => { throw new BlockfrostError("Definition unavailable", boundary.status, "/txs/identity"); },
}));
vi.mock("../../components/explorer/SurveyTransaction", () => ({
  SurveyTransaction: () => <button>Review public response</button>,
}));

it.each([404, 503])("stops offering responses after survey verification refresh status %s", async (status) => {
  boundary.status = status;
  const hash = "11".repeat(32);
  const key = ["dingo", "surveys", "detail", hash, "0"];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(key, {
    survey: { hash, index: 0, owner: "22".repeat(28), title: "Saved survey", description: "Example", endEpoch: 100,
      questions: [{ tag: 0, prompt: "Your answer?", options: [], required: false, min: 0, max: 100, step: 1, budget: 100, requireAll: false }],
    },
    publication: { epoch: 1 },
  });
  client.setQueryData(["dingo", "surveys", "results", hash, "0"], { responses: [], cancelled: false });
  const container = document.createElement("div");
  const root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/surveys/${hash}/0`]}>
          <Routes><Route path="/surveys/:hash/:index" element={<SurveyDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ));
    expect(container.textContent).toContain("Review public response");
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(client.getQueryData(key)).toBeDefined();
    expect(container.textContent).toContain("Definition unavailable");
    expect(container.textContent).not.toContain("Review public response");
    expect(container.textContent).toContain("Retry survey");
    if (status === 404) expect(container.textContent).not.toContain("Saved survey");
    else expect(container.textContent).toContain("Saved survey");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
