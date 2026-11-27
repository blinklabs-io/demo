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
  TransactionTracker: ({
    hash,
    validUntil,
  }: {
    hash: string;
    validUntil?: number;
  }) => <span data-tracked-hash={hash} data-valid-until={validUntil} />,
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
          outputs: [{ address: "address", lovelace: 1000000n, assets: [] }],
          outputCount: 1,
          fee: 1n,
          totalOutputLovelace: 1000000n,
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
    expect(host.textContent).toContain("Pending transaction");
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

it("passes the indexed upper validity bound to the tracker", async () => {
  const hash = "cd".repeat(32);
  vi.mocked(blockfrostFetch).mockImplementation(async (path: string) => {
    if (path === `/api/v0/txs/${hash}`)
      return {
        hash,
        block: "ef".repeat(32),
        block_height: 100,
        block_time: 1700000000,
        slot: 900,
        index: 0,
        output_amount: [{ unit: "lovelace", quantity: "1000000" }],
        fees: "170000",
        deposit: "0",
        size: 300,
        invalid_before: null,
        invalid_hereafter: "1100",
        utxo_count: 2,
        withdrawal_count: 0,
        mir_cert_count: 0,
        delegation_count: 0,
        stake_cert_count: 0,
        pool_update_count: 0,
        pool_retire_count: 0,
        asset_mint_or_burn_count: 0,
        redeemer_count: 0,
        valid_contract: true,
      };
    throw new BlockfrostError("Not found", 404, "");
  });
  useMempoolStore.setState({ status: "live", pendingTxs: new Map() });
  notifyManager.setScheduler(queueMicrotask);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = document.createElement("div"),
    root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/explorer/tx/${hash}`]}>
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
    expect(
      host
        .querySelector("[data-tracked-hash]")
        ?.getAttribute("data-valid-until"),
    ).toBe("1100");
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
