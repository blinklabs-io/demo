import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useTipStore } from "../../stores/tipStore";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { NodeHealthStrip } from "./NodeHealthStrip";
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: vi.fn(() => ({ isLoading: true, dataUpdatedAt: 0 })),
}));
it("identifies rollback reconciliation while the cleared health record reloads", async () => {
  const previous = useTipStore.getState();
  const client = new QueryClient();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    vi.mocked(useNodeHealth).mockReturnValue({ isLoading: true, dataUpdatedAt: 0 } as ReturnType<typeof useNodeHealth>);
    useTipStore.setState({ lastAction: "undo", lastEventAt: Date.now(), tip: null });
    await act(async () => root.render(<QueryClientProvider client={client}><NodeHealthStrip /></QueryClientProvider>));
    expect(container.textContent).toContain("Reconciling chain");
    expect(container.textContent).not.toContain("Connecting to Dingo");
  } finally { await act(async () => root.unmount()); useTipStore.setState(previous); client.clear(); }
});

it("keeps health visible alongside failed network verification", async () => {
  const previous = useTipStore.getState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["dingo", "genesis"], undefined);
  vi.mocked(fetch).mockRejectedValue(new Error("Genesis unavailable"));
  vi.mocked(useNodeHealth).mockReturnValue({ data: { isHealthy: true, tipHeight: 42, tipEpoch: 1, tipTime: 1 }, dataUpdatedAt: Date.now(), isLoading: false } as ReturnType<typeof useNodeHealth>);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    useTipStore.setState({ lastAction: null, lastEventAt: null, tip: null });
    await act(async () => root.render(<QueryClientProvider client={client}><NodeHealthStrip /></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toContain("Healthy");
    expect(container.textContent).toContain("Network verification unavailable");
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain("Tip #42");
  } finally { await act(async () => root.unmount()); useTipStore.setState(previous); client.clear(); }
});
