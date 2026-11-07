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
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Transaction view")!.click());
    expect(container.querySelectorAll('.mempool-tx-hub')).toHaveLength(12);
    expect(container.querySelectorAll('.mempool-dependency')).toHaveLength(1);
    expect(container.querySelector('.mempool-tx-hub title')?.textContent).toContain("42 base units");
    expect(container.querySelector('.mempool-output circle title')?.textContent).toContain("42 base units");
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

it("shows all 320 pending transactions, retains positions on arrivals, and inspects a transaction outside the old page", async () => {
  const transactions: PendingTx[] = Array.from({ length: 320 }, (_, i) => ({ hash: i.toString(16).padStart(64, "0"), fee: 200000n, inputCount: 0, outputCount: 0, totalOutputLovelace: 0n, seenAt: i, inputs: [], outputs: [] }));
  const container = document.createElement("div"), root = createRoot(container);
  const render = (rows: PendingTx[]) => root.render(<MemoryRouter><MempoolGraph transactions={rows} status="live" /></MemoryRouter>);
  try {
    await act(async () => render(transactions));
    expect(container.querySelectorAll(".mempool-overview-node")).toHaveLength(320);
    expect(container.querySelectorAll('.mempool-overview-node[tabindex="0"]')).toHaveLength(1);
    const first = container.querySelector('.mempool-overview-node')!;
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(container.querySelector('.mempool-overview-node[tabindex="0"]')?.getAttribute("data-hash")).toBe(transactions[319].hash);
    const node = container.querySelectorAll(".mempool-overview-node")[319];
    const position = [node.getAttribute("data-x"), node.getAttribute("data-y")];
    await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')?.textContent).toContain(transactions[319].hash);
    const zoom = container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
    await act(async () => zoom.click());
    const transform = container.querySelector('.mempool-overview-canvas > g')?.getAttribute("transform");
    const button = (name: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === name)!;
    await act(async () => button("Transaction view").click());
    await act(async () => render([{ ...transactions[0], hash: "ff".repeat(32) }, ...transactions]));
    await act(async () => button("Whole mempool").click());
    expect(container.querySelector('.mempool-overview-canvas > g')?.getAttribute("transform")).toBe(transform);
    const retained = container.querySelector(`[data-hash="${transactions[319].hash}"]`)!;
    expect([retained.getAttribute("data-x"), retained.getAttribute("data-y")]).toEqual(position);
    expect(container.querySelectorAll(".mempool-overview-node")).toHaveLength(321);
    await act(async () => render([]));
    expect(container.querySelector('[aria-label="Selected pending transaction"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
