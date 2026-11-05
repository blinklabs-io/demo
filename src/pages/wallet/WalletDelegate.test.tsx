import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import type {
  DelegationTarget,
  PreparedDelegation,
} from "../../lib/dingo/delegation";
import { useWalletStore } from "../../stores/walletStore";
import WalletDelegate from "./WalletDelegate";
const boundary = vi.hoisted(() => ({
  mode: "pending" as "pending" | "error" | "failed" | "valid",
  prepares: 0,
  posts: 0,
  accounts: 0,
  refreshes: 0,
}));
vi.mock("../../components/explorer/HashLink", () => ({
  HashLink: ({ id }: { id: string }) => <span>{id}</span>,
}));
vi.mock("../../lib/dingo/delegation", () => ({
  delegationAccount: async () => {
    boundary.accounts++;
    return { registered: true, pool_id: null, drep_id: null };
  },
  prepareDelegation: async (
    _api: Cip30WalletApi,
    address: string,
    target: DelegationTarget,
    assert: () => void,
  ) => {
    assert();
    boundary.prepares++;
    return {
      address,
      target,
      registered: true,
      deposit: 0n,
      tx: { body: () => ({ fee: () => 170000n }) },
    } as unknown as PreparedDelegation;
  },
  submitDelegation: async (
    _api: Cip30WalletApi,
    _draft: PreparedDelegation,
    assert: () => void,
  ) => {
    assert();
    boundary.posts++;
    return "11".repeat(32);
  },
}));
vi.mock("../../lib/dingo/transactionConfirmation", async (original) => {
  const actual =
    await original<typeof import("../../lib/dingo/transactionConfirmation")>();
  return {
    ...actual,
    readTransactionConfirmation: async (hash: string) => {
      if (boundary.mode === "pending") return null;
      if (boundary.mode === "error")
        throw new Error("503: confirmation unavailable");
      if (boundary.mode === "failed")
        throw new actual.ConfirmationFailure(hash, "22".repeat(32));
      return { hash, block: "22".repeat(32), valid_contract: true };
    },
  };
});
const refreshBalance = useWalletStore.getState().refreshBalance;
let root: Root, client: QueryClient, container: HTMLDivElement;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(boundary, {
    mode: "pending",
    prepares: 0,
    posts: 0,
    accounts: 0,
    refreshes: 0,
  });
  notifyManager.setScheduler(queueMicrotask);
  useWalletStore.setState({
    status: "connected",
    walletApi: {} as Cip30WalletApi,
    connectionId: 1,
    rewardAddress: "stake_fixture",
    changeAddress: null,
    refreshBalance: async () => {
      boundary.refreshes++;
    },
  });
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/wallet/delegate?pool=pool_fixture"]}>
          <WalletDelegate />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  useWalletStore.setState({ refreshBalance });
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
}
it("tracks delegation pending, retryable lookup failure, and confirmed inclusion without resubmitting", async () => {
  await click("Review delegation");
  await click("Sign & submit");
  expect(container.textContent).toContain("waiting for confirmation");
  expect(boundary.posts).toBe(1);
  boundary.mode = "error";
  await act(async () =>
    client.refetchQueries({ queryKey: ["dingo", "delegation-confirmation"] }),
  );
  expect(container.textContent).toContain("confirmation unavailable");
  const accountsBefore = boundary.accounts,
    refreshBefore = boundary.refreshes;
  boundary.mode = "valid";
  await click("Retry confirmation");
  expect(container.textContent).toContain("Delegation confirmed");
  expect(boundary.accounts).toBeGreaterThan(accountsBefore);
  expect(boundary.refreshes).toBeGreaterThan(refreshBefore);
  expect(boundary.posts).toBe(1);
  expect(boundary.prepares).toBe(1);
});
it("shows a terminal included failure and requires an explicit new draft", async () => {
  boundary.mode = "failed";
  await click("Review delegation");
  await click("Sign & submit");
  expect(container.textContent).toContain("Delegation failed on chain");
  expect(container.textContent).toContain("intended actions were not applied");
  expect(container.textContent).not.toContain("waiting for confirmation");
  expect(container.textContent).not.toContain("Retry confirmation");
  await click("Start new draft");
  expect(boundary.posts).toBe(1);
  expect(boundary.prepares).toBe(1);
  expect(container.textContent).not.toContain("Delegation failed");
});
