import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PoolProducer } from "./PoolProducer";
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: () => ({
    data: { tipEpoch: 123 },
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../../lib/dingo/blockHeader", () => ({
  blockBytesQuery: (hash: string) => ({
    queryKey: ["dingo", "block-native", hash],
    staleTime: Infinity,
  }),
  decodeHeaderVersion: (value: unknown) => value,
}));
it("shows the producing software and links its block using cached Dingo observations", async () => {
  const client = new QueryClient();
  const hash = "11".repeat(32);
  client.setQueryData(["dingo", "pool", "pool1test", "producer-block", 123], {
    hash,
    height: 123,
    slot: 456,
    slot_leader: "pool1test",
    time: 1700000000,
  });
  client.setQueryData(["dingo", "block-native", hash], {
    major: "11",
    minor: "69",
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <PoolProducer poolId="pool1test" />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    expect(host.querySelector('[data-node="dingo"]')).not.toBeNull();
    expect(host.querySelector("strong")?.textContent).toBe("Dingo");
    expect(host.querySelector("a")?.getAttribute("href")).toContain(
      `/explorer/block/${hash}`,
    );
    expect(host.textContent).toContain("Self-reported");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
