import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useTipStore } from "../../stores/tipStore";
import { NodeHealthStrip } from "./NodeHealthStrip";
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: () => ({ isLoading: true, dataUpdatedAt: 0 }),
}));
it("identifies rollback reconciliation while the cleared health record reloads", async () => {
  const previous = useTipStore.getState();
  const client = new QueryClient();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    useTipStore.setState({ lastAction: "undo", lastEventAt: Date.now(), tip: null });
    await act(async () => root.render(<QueryClientProvider client={client}><NodeHealthStrip /></QueryClientProvider>));
    expect(container.textContent).toContain("Reconciling chain");
    expect(container.textContent).not.toContain("Connecting to Dingo");
  } finally { await act(async () => root.unmount()); useTipStore.setState(previous); client.clear(); }
});
