import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { MempoolGraph } from "./MempoolGraph";
import type { PendingTx } from "../../lib/dingo/utxorpc/streaming";
vi.mock("../../lib/chain/useCompactVisual", () => ({ useCompactVisual: () => false }));

it("selects hubs by keyboard, shows all ports, paginates, and removes departed transactions", async () => {
  const transactions: PendingTx[] = Array.from({ length: 13 }, (_, i) => ({ hash: i.toString(16).padStart(64, "0"), fee: 200000n + BigInt(i), inputCount: 1, outputCount: 1, totalOutputLovelace: 1000000n, seenAt: i, inputs: [{ hash: "22".repeat(32), index: i }], outputs: [{ address: "address", lovelace: 1000000n, assets: [] }] }));
  const container = document.createElement("div"), root = createRoot(container);
  const render = (rows: PendingTx[], status: "live" | "error" = "live") => root.render(<MemoryRouter><MempoolGraph transactions={rows} status={status} /></MemoryRouter>);
  try {
    transactions[1].inputs = [{ hash: transactions[0].hash, index: 0 }];
    transactions[0].outputs[0].assets = [{ unit: "33".repeat(28) + "544f4b", quantity: 42n }];
    await act(async () => render(transactions));
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(12);
    expect(container.querySelectorAll('.mempool-dependency')).toHaveLength(1);
    await act(async () => container.querySelector('.mempool-tx-hub')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')?.textContent).toContain("Output #0");
    expect(container.querySelector('[aria-label="Selected pending transaction"]')?.textContent).toContain("42 base units");
    const next = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Next")!;
    await act(async () => next.click());
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(1);
    await act(async () => render([]));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')).toBeNull();
    expect(container.textContent).toContain("Waiting for the next connection.");
    await act(async () => render(transactions, "error"));
    expect(container.textContent).toContain("last observed pending set");
    await act(async () => render(transactions));
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(12);
    expect(container.querySelector('[aria-label="Selected pending transaction"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
