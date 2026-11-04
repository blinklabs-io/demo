import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import { useWalletStore } from "../../stores/walletStore";
import { ProposalVoting } from "./ProposalVoting";

vi.mock("../../lib/dingo/useWalletDRep", () => ({
  useWalletDRep: () => ({ data: { drep_id: "drep1fixture", retired: false, expired: false } }),
}));
vi.mock("../../lib/dingo/nodeHealth", () => ({
  useNodeHealth: () => ({ data: { tipEpoch: 10 } }),
}));
vi.mock("../../lib/dingo/governanceVote", () => ({
  votingClosed: () => false,
  governanceError: (error: unknown) => error,
  prepareGovernanceVote: async (_api: unknown, _proposal: unknown, choice: string, assert: () => void) => {
    assert();
    return { choice, tx: { body: () => ({ fee: () => 170000n }) } };
  },
  submitGovernanceVote: async (_api: unknown, _proposal: unknown, _prepared: unknown, assert: () => void) => {
    assert();
    return "11".repeat(32);
  },
}));
afterEach(() => { vi.useRealTimers(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

it.each([true, false])("tracks a submitted vote through not-indexed and valid=%s confirmation", async (valid) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  notifyManager.setScheduler(queueMicrotask);
  const hash = "11".repeat(32);
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Not found" }, 404))
    .mockResolvedValueOnce(response({ hash, block: "22".repeat(32), valid_contract: valid }))
    .mockResolvedValueOnce(response({ hash, block: "22".repeat(32), valid_contract: true }));
  useWalletStore.setState({ status: "connected", walletApi: { cip95: {} } as Cip30WalletApi, connectionId: 1, refreshBalance: async () => {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ProposalVoting proposal={{ id: "proposal", tx_hash: "33".repeat(32), cert_index: 0, expiration: 100, ratified_epoch: null, enacted_epoch: null, dropped_epoch: null, expired_epoch: null }} /></MemoryRouter></QueryClientProvider>));
    await act(async () => container.querySelector<HTMLInputElement>('input[value="yes"]')!.click());
    await click("Review vote");
    await click("Sign & submit vote");
    expect(container.textContent).toContain("Waiting for on-chain confirmation.");
    expect(container.textContent).not.toContain("Vote confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    if (!valid) {
      expect(container.textContent).toContain("failed script validation");
      expect(container.textContent).toContain("Vote failed");
      expect(container.textContent).not.toContain("Vote confirmed");
      expect(container.textContent).not.toContain("Retry confirmation");
      expect(fetch).toHaveBeenCalledTimes(2);
      return;
    }
    expect(container.textContent).toContain("Vote confirmed");
    expect(container.textContent).toContain("Included on chain.");
    expect(container.querySelector(`a[href="/explorer/tx/${hash}"]`)).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});
