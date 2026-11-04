import { describe, expect, it } from "vitest";
import { isMutableChainQuery } from "./useChainReconciliation";

describe("chain transition query ownership", () => {
  it.each([
    ["dingo", "block", "hash"],
    ["dingo", "tx", "hash"],
    ["dingo", "tx", "hash", "utxos"],
    ["dingo", "pool", "pool1"],
    ["dingo", "drep", "drep1"],
    ["dingo", "address", "addr", "transactions", 1],
  ])("reconciles active mutable records %j", (...key) => {
    expect(isMutableChainQuery(key)).toBe(true);
  });
  it.each([
    ["dingo", "epoch", 10],
    ["dingo", "network"],
    ["dingo", "account", "stake", "journey", "rewards"],
    ["dingo", "proposal", "id", "chamber-votes"],
    ["dingo", "tx", "hash", "cbor"],
    ["dingo", "block-header-version", "hash"],
    ["dingo", "epoch", "10", "parameters"],
    ["dingo", "genesis"],
    ["dingo", "network", "eras"],
    ["dingo", "wallet", "epoch-balance-snapshots", "addr"],
    ["dingo", "holder-results", "id"],
    ["dingo", "pool-directory"],
    ["dingo", "surveys", "results", "hash", "0"],
    ["sundae", "v4", "weekly", "pool"],
  ])("does not restart immutable or user-requested expensive reads %j", (...key) => {
    expect(isMutableChainQuery(key)).toBe(false);
  });
});

it("clears active records on rollback but keeps them through a stream reconnect", async () => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { QueryClient, QueryClientProvider, QueryObserver } = await import("@tanstack/react-query");
  const { useTipStore } = await import("../../stores/tipStore");
  const { useChainReconciliation } = await import("./useChainReconciliation");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const record = ["dingo", "tx", "reconnect"];
  client.setQueryData(record, { confirmed: true });
  const observer = new QueryObserver(client, { queryKey: record, queryFn: () => new Promise<never>(() => {}) });
  const unsubscribe = observer.subscribe(() => {});
  function Reconcile() { useChainReconciliation(); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Reconcile))));
    await act(async () => useTipStore.setState((state) => ({ revision: state.revision + 1, lastAction: "connect" })));
    expect(client.getQueryData(record)).toEqual({ confirmed: true });
  } finally {
    await act(async () => root.unmount());
    unsubscribe();
    client.clear();
  }
});

it("reconciles mutable aggregates on rollback without restarting immutable bytes or manual recounts", () => {
  expect(isMutableChainQuery(["dingo", "epoch", 10], true)).toBe(true);
  expect(isMutableChainQuery(["dingo", "network"], true)).toBe(true);
  expect(isMutableChainQuery(["dingo", "tx", "hash", "cbor"], true)).toBe(false);
  expect(isMutableChainQuery(["dingo", "holder-results", "id"], true)).toBe(false);
});

it("clears active and inactive orphaned records on rollback while retaining immutable data", async () => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { QueryClient, QueryClientProvider, QueryObserver } = await import("@tanstack/react-query");
  const { useTipStore } = await import("../../stores/tipStore");
  const { useChainReconciliation } = await import("./useChainReconciliation");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const record = ["dingo", "tx", "orphan"];
  const bytes = [...record, "cbor"];
  const inactive = ["dingo", "tx", "inactive"];
  client.setQueryData(record, { confirmed: true });
  client.setQueryData(bytes, "abcd");
  client.setQueryData(inactive, { confirmed: true });
  const observer = new QueryObserver(client, {
    queryKey: record,
    queryFn: () => new Promise<never>(() => {}),
  });
  const unsubscribe = observer.subscribe(() => {});
  function Reconcile() { useChainReconciliation(); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Reconcile))));
    await act(async () => useTipStore.setState((state) => ({ revision: state.revision + 1, lastAction: "undo" })));
    expect(client.getQueryData(record)).toBeUndefined();
    expect(client.getQueryState(record)?.fetchStatus).toBe("fetching");
    expect(client.getQueryData(bytes)).toBe("abcd");
    expect(client.getQueryData(inactive)).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    unsubscribe();
    client.clear();
  }
});


it.each([
  ["wallet-tools", "confirmation", "hash"],
  ["dingo", "vote-confirmation", "hash"],
  ["dingo", "holder-answer", "hash"],
  ["dingo", "reward-withdrawal", "hash"],
  ["dingo", "surveys", "confirmation", "hash"],
])("rechecks stopped confirmation observations on rollback %j", (...key) => {
  expect(isMutableChainQuery(key, true)).toBe(true);
  expect(isMutableChainQuery(key)).toBe(false);
});
