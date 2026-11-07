import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import TxDetail from "./TxDetail";
import { useMempoolStore } from "../../stores/mempoolStore";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
vi.mock("../../components/explorer/TransactionTracker", () => ({
  TransactionTracker: ({ hash }: { hash: string }) => (
    <span data-tracked-hash={hash} />
  ),
}));
vi.mock("../../lib/dingo/blockfrost", async (original) => ({
  ...(await original<typeof import("../../lib/dingo/blockfrost")>()),
  blockfrostFetch: vi.fn(),
}));

it("resolves uppercase pending IDs with the same lowercase identity as the tracker", async () => {
  const hash = "ab".repeat(32);
  vi.mocked(blockfrostFetch).mockRejectedValue(
    new BlockfrostError("Not found", 404, ""),
  );
  useMempoolStore.setState({
    status: "live",
    pendingTxs: new Map([
      [
        hash,
        {
          hash,
          inputCount: 1,
          inputs: [{ hash: "22".repeat(32), index: 0 }],
          outputs: [{ address: "address", lovelace: 1000000n }],
          outputCount: 1,
          fee: 1n,
          totalOutputLovelace: 1n,
          seenAt: Date.now(),
        },
      ],
    ]),
  });
  notifyManager.setScheduler(queueMicrotask);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = document.createElement("div"),
    root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/explorer/tx/${hash.toUpperCase()}`]}>
          <Routes>
            <Route path="/explorer/tx/:hash" element={<TxDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("Waiting for a block.");
    expect(
      host
        .querySelector("[data-tracked-hash]")
        ?.getAttribute("data-tracked-hash"),
    ).toBe(hash);
    expect(blockfrostFetch).toHaveBeenCalledWith(`/api/v0/txs/${hash}`);
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
