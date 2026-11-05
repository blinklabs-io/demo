import { describe, expect, it } from "vitest";
import { isMutableChainQuery } from "./useChainReconciliation";

describe("chain transition query ownership", () => {
  it.each([
    ["dingo", "block", "hash"],
    ["dingo", "tx", "hash"],
    ["dingo", "tx", "hash", "utxos"],
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

it("reconciles mutable aggregates and census snapshots on rollback while preserving immutable bytes", () => {
  expect(isMutableChainQuery(["dingo", "epoch", 10], true)).toBe(true);
  expect(isMutableChainQuery(["dingo", "network"], true)).toBe(true);
  expect(isMutableChainQuery(["dingo", "tx", "hash", "cbor"], true)).toBe(false);
  expect(isMutableChainQuery(["dingo", "holder-results", "id"], true)).toBe(true);
});

it.each([
  ["dingo", "tx", "orphan"],
  ["dingo", "asset", "orphan"],
  ["dingo", "asset", "orphan", "holder-map"],
  ["dingo", "policy-assets", "policy", 1],
  ["dingo", "metadata-label", "674", "json", 6, 1],
  ["dingo", "proposals", 20, 1],
  ["dingo", "committee"],
  ["dingo", "drep", "identity", "delegators", 20, 1],
])("clears an active orphaned record %j before reconciliation while retaining immutable bytes and not refetching inactive data", async (...record) => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { vi } = await import("vitest");
  const { QueryClient, QueryClientProvider, QueryObserver } = await import("@tanstack/react-query");
  const { useTipStore } = await import("../../stores/tipStore");
  const { useChainReconciliation } = await import("./useChainReconciliation");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const bytes = ["dingo", "tx", "orphan", "cbor"];
  const inactive = ["dingo", "tx", "inactive"];
  const inactiveFetch = vi.fn(async () => ({ confirmed: true }));
  client.setQueryDefaults(inactive, { queryFn: inactiveFetch });
  const lookup = ["dingo", "lookup", "inactive"];
  client.setQueryData(lookup, { kind: "tx" });
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
    await act(async () => useTipStore.setState((state) => ({ revision: state.revision + 1, lastAction: "apply" })));
    expect(client.getQueryData(record)).toEqual({ confirmed: true });
    expect(client.getQueryData(inactive)).toEqual({ confirmed: true });
    expect(inactiveFetch).not.toHaveBeenCalled();
    await act(async () => useTipStore.setState((state) => ({ revision: state.revision + 1, lastAction: "undo" })));
    expect(client.getQueryData(record)).toBeUndefined();
    expect(client.getQueryState(record)?.fetchStatus).toBe("fetching");
    expect(client.getQueryData(bytes)).toBe("abcd");
    expect(client.getQueryData(inactive)).toBeUndefined();
    expect(client.getQueryData(lookup)).toBeUndefined();
    expect(inactiveFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(inactive)?.fetchStatus).toBe("idle");
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


it.each([
  ["dingo", "asset", "asset"],
  ["dingo", "asset", "asset", "holder-map"],
  ["dingo", "asset", "asset", "mint-map"],
  ["dingo", "policy-assets", "policy", 1],
  ["dingo", "metadata-label", "674", "cbor", 6, 1],
  ["dingo", "proposals", 20, 1],
  ["dingo", "committee"],
  ["dingo", "drep", "identity", "delegators", 20, 1],
])("does not restart indexed catalogs on each apply %j", (...key) => {
  expect(isMutableChainQuery(key)).toBe(false);
  expect(isMutableChainQuery(key, true)).toBe(true);
});


it.each([["dingo", "pool", "pool"], ["dingo", "drep", "identity"]])("refreshes active stake summaries on ordinary apply %j", (...key) => {
  expect(isMutableChainQuery(key)).toBe(true);
});


it.each([
  ["dingo", "delegation-confirmation", "hash"],
  ["dingo", "handle", "example"],
  ["dingo", "surveys", "detail", "hash", "0"],
  ["dingo", "surveys", "directory"],
  ["dingo", "surveys", "results", "hash", "0"],
])("reconciles indexed identities and survey definitions on uncertainty %j", (...key) => {
  expect(isMutableChainQuery(key, true)).toBe(true);
  expect(isMutableChainQuery(key)).toBe(false);
});


it("clears an uncertain manual census without starting an unsolicited recount", async () => {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { vi } = await import("vitest");
  const { QueryClient, QueryClientProvider, QueryObserver } = await import("@tanstack/react-query");
  const { useTipStore } = await import("../../stores/tipStore");
  const { useChainReconciliation } = await import("./useChainReconciliation");
  const client = new QueryClient();
  const key = ["dingo", "holder-results", "proposal"];
  const recount = vi.fn(async () => ({ counted: 10 }));
  client.setQueryData(key, { counted: 20 });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: recount, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  function Reconcile() { useChainReconciliation(); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Reconcile))));
    await act(async () => useTipStore.setState((state) => ({ revision: state.revision + 1, lastAction: "undo" })));
    expect(client.getQueryData(key)).toBeUndefined();
    expect(recount).not.toHaveBeenCalled();
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
  } finally {
    await act(async () => root.unmount());
    unsubscribe();
    client.clear();
  }
});
