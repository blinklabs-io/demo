import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { MempoolGraph } from "./MempoolGraph";
import type { PendingTx } from "../../lib/dingo/utxorpc/streaming";
vi.mock("../../lib/chain/useCompactVisual", () => ({ useCompactVisual: () => false }));

it("selects hubs by keyboard, shows all ports, paginates, and removes departed transactions", async () => {
  const transactions: PendingTx[] = Array.from({ length: 13 }, (_, i) => ({ hash: i.toString(16).padStart(64, "0"), fee: 200000n + BigInt(i), inputCount: 1, outputCount: 1, totalOutputLovelace: 1000000n, seenAt: i, inputs: [{ hash: "22".repeat(32), index: i }], outputs: [{ address: "address", lovelace: 1000000n }] }));
  const container = document.createElement("div"), root = createRoot(container);
  const render = (rows: PendingTx[]) => root.render(<MemoryRouter><MempoolGraph transactions={rows} /></MemoryRouter>);
  try {
    await act(async () => render(transactions));
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(12);
    await act(async () => container.querySelector('.mempool-tx-hub')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')?.textContent).toContain("Output #0");
    const next = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Next")!;
    await act(async () => next.click());
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(1);
    await act(async () => render([]));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')).toBeNull();
    expect(container.textContent).toContain("Waiting for the next connection.");
    await act(async () => render(transactions));
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(12);
    expect(container.querySelector('[aria-label="Selected pending transaction"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
