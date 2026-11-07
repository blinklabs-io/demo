import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import Governance from "./Governance";
import Surveys from "./Surveys";

const clock = vi.hoisted(() => ({ epoch: 10, failed: false, healthy: true }));
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: () => ({ data: { tipEpoch: clock.epoch, isHealthy: clock.healthy }, isError: clock.failed }),
}));

it.each(["proposals", "surveys"])("hides inactive %s until explicitly requested and rechecks the epoch", async (directory) => {
  clock.epoch = 10;
  clock.failed = false;
  clock.healthy = true;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const titles = ["Open now", "Ended", "Unknown deadline", "Enacted", "Ratified", "Dropped", "Expired"];
  if (directory === "proposals") {
    client.setQueryData(["dingo", "committee"], { is_dissolved: false, quorum: { numerator: 1, denominator: 2 }, members: [] });
    client.setQueryData(["dingo", "proposals", "lifecycle", 1], titles.map((title, i) => {
      client.setQueryData(["dingo", "proposal", String(i), "metadata"], { json_metadata: { body: { title } } });
      return { id: String(i), governance_type: "info_action", expiration: i === 1 ? 9 : i === 2 ? undefined : 10,
        enacted_epoch: i === 3 ? 9 : null, ratified_epoch: i === 4 ? 9 : null,
        dropped_epoch: i === 5 ? 9 : null, expired_epoch: i === 6 ? 9 : null };
    }));
  } else {
    client.setQueryData(["dingo", "surveys", "directory"], { pageParams: [1], pages: [[{
      tx_hash: "11".repeat(32), json_metadata: [0, titles.slice(0, 3).map((title, i) => ({
        "0": 5, "2": title, "4": [4], "5": i === 1 ? 9 : i === 2 ? undefined : 10, "7": [],
      }))],
    }]] });
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => root.render(<QueryClientProvider client={client}><MemoryRouter>{directory === "proposals" ? <Governance /> : <Surveys />}</MemoryRouter></QueryClientProvider>);
  try {
    await act(async () => render());
    expect(container.textContent).toContain("Open now");
    for (const title of titles.slice(1, directory === "proposals" ? undefined : 3)) expect(container.textContent).not.toContain(title);
    const checkbox = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) => input.parentElement?.textContent?.includes(directory === "proposals" ? "Show inactive" : "Show expired"))!;
    await act(async () => checkbox.click());
    expect(container.textContent).toContain("Ended");
    expect(container.textContent).toContain("Unknown deadline");
    if (directory === "proposals") expect(container.textContent).toContain("Enacted");
    await act(async () => checkbox.click());
    clock.epoch = 11;
    await act(async () => render());
    expect(container.textContent).not.toContain("Open now");
    clock.epoch = 10;
    clock.failed = true;
    await act(async () => render());
    expect(container.textContent).not.toContain("Open now");
    expect(container.textContent).toContain("Unable to verify the current epoch");
    clock.failed = false;
    clock.healthy = false;
    await act(async () => render());
    expect(container.textContent).not.toContain("Open now");
    expect(container.textContent).toContain("Unable to verify the current epoch");
    clock.healthy = true;
    vi.mocked(fetch).mockImplementation(async () => new Response('{"message":"Lifecycle unavailable"}', { status: 503 }));
    await act(async () => { await client.refetchQueries({ queryKey: ["dingo", directory === "proposals" ? "proposals" : "surveys"] }); });
    await act(async () => render());
    expect(container.textContent).toContain("Open now");
    expect(container.textContent).not.toContain("Ended");
    if (directory === "proposals") expect(container.textContent).toContain("Showing previously loaded data");
    await act(async () => checkbox.click());
    expect(container.textContent).toContain("Open now");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    clock.failed = false;
    clock.healthy = true;
  }
});
