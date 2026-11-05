import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { useDraftGuard } from "../../lib/useDraftGuard";
const boundary = vi.hoisted(() => ({ reload: vi.fn(), header: vi.fn(), reads: vi.fn(), start: vi.fn() }));
vi.mock("./Header", () => ({ Header: () => { boundary.header(); return <p>Header</p>; } }));
vi.mock("../../lib/chain/useChainReconciliation", () => ({ useChainReconciliation: () => {} }));
vi.mock("../../lib/dingo/networkSelection", () => ({ reloadDingoPage: boundary.reload }));
vi.mock("../../stores/tipStore", () => ({ useTipStore: (select: (state: unknown) => unknown) => select({ start: boundary.start }) }));
vi.mock("../../stores/mempoolStore", () => ({ useMempoolStore: (select: (state: unknown) => unknown) => select({ start: boundary.start }) }));
afterEach(() => { vi.clearAllMocks(); });
it("adds selected network metadata while preserving prefill, hash, navigation state and the active draft", async () => {
  let captured: (() => void) | undefined;
  function Page() {
    const guard = useDraftGuard("draft");
    const location = useLocation();
    useLayoutEffect(() => { captured ??= guard; });
    return <p>{JSON.stringify(location.state)}</p>;
  }
  const router = createMemoryRouter([{ element: <AppShell />, children: [{ path: "/wallet/send", element: <Page /> }] }], { initialEntries: [{ pathname: "/wallet/send", search: "?recipient=addr_test1", hash: "#review", state: { transactionCbor: "abcd" } }] });
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(new URLSearchParams(router.state.location.search).get("network")).toBe("preview");
    expect(new URLSearchParams(router.state.location.search).get("recipient")).toBe("addr_test1");
    expect(router.state.location.hash).toBe("#review");
    expect(router.state.location.state).toEqual({ transactionCbor: "abcd" });
    expect(captured).toBeDefined();
    expect(() => captured!()).not.toThrow();
  } finally { await act(async () => root.unmount()); router.dispose(); }
});
it.each(["preprod", "invalid"])("reloads explicit network %s without mounting old-context readers", async (network) => {
  function Page() { boundary.reads(); return <p>Chain records</p>; }
  const path = `/explorer/tx/shared?network=${network}#outputs`;
  const router = createMemoryRouter([{ element: <AppShell />, children: [{ path: "/explorer/tx/:hash", element: <Page /> }] }], { initialEntries: [path] });
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(boundary.reload).toHaveBeenCalledWith(path);
    expect(boundary.reads).not.toHaveBeenCalled();
    expect(boundary.header).not.toHaveBeenCalled();
    expect(boundary.start).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); router.dispose(); }
});
