import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { useMempoolStore } from "../../stores/mempoolStore";
import type { PendingTx } from "../../lib/dingo/utxorpc/streaming";
import MempoolFeed from "./MempoolFeed";

vi.mock("../../components/explorer/MempoolGraph", () => ({
  MempoolGraph: () => (
    <section data-testid="mempool-graph">Inputs and outputs</section>
  ),
}));
vi.mock("../../lib/useNow", () => ({ useNow: () => 1_000 }));

it("shows inputs and outputs before a collapsed transaction list", async () => {
  const transactions: PendingTx[] = Array.from({ length: 20 }, (_, index) => ({
    hash: index.toString(16).padStart(64, "0"),
    fee: 200_000n,
    inputCount: 1,
    outputCount: 1,
    totalOutputLovelace: 1_000_000n,
    seenAt: index,
    inputs: [{ hash: "22".repeat(32), index: 0 }],
    outputs: [{ address: "address", lovelace: 1_000_000n, assets: [] }],
  }));
  useMempoolStore.setState({
    status: "live",
    error: null,
    pendingTxs: new Map(transactions.map((transaction) => [transaction.hash, transaction])),
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <MempoolFeed />
        </MemoryRouter>,
      ),
    );
    const graph = host.querySelector('[data-testid="mempool-graph"]')!;
    const list = host.querySelector<HTMLDetailsElement>(".mempool-transaction-list")!;
    expect(
      graph.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(list.open).toBe(false);
    expect(list.querySelector("table")).toBeNull();
    expect(list.querySelector("summary")?.textContent).toContain("20 transactions");

    await act(async () => list.querySelector("summary")!.click());
    expect(list.open).toBe(true);
    expect(list.querySelectorAll("tbody tr")).toHaveLength(20);

    await act(async () => list.querySelector("summary")!.click());
    expect(list.open).toBe(false);
    expect(list.querySelector("table")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    useMempoolStore.setState({ status: "idle", error: null, pendingTxs: new Map() });
  }
});
