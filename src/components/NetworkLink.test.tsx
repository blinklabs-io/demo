import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Link, NavLink } from "./NetworkLink";
import { networkHref, networkTo } from "../lib/dingo/networkLinks";
import { HashLink } from "./explorer/HashLink";
vi.mock("../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "preprod" } }));
it("renders copyable Preprod entity hrefs before navigation", () => {
  const html = renderToStaticMarkup(<MemoryRouter><HashLink kind="address" id="addr_test1shared" /><NavLink to="/explorer/pools?ticker=BLINK#results">Pools</NavLink></MemoryRouter>);
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.querySelector('a[href="/explorer/address/addr_test1shared?network=preprod"]')).not.toBeNull();
  expect(container.querySelector('a[href="/explorer/pools?ticker=BLINK&network=preprod#results"]')).not.toBeNull();
});
it("preserves object destinations, state and hash when clicking", async () => {
  const state = { transactionCbor: "abcd" };
  const router = createMemoryRouter([{ path: "/", element: <Link to={{ pathname: "/wallet/tools/transactions", search: "?inspect=1", hash: "#cbor" }} state={state}>Open studio</Link> }, { path: "/wallet/tools/transactions", element: <p>Studio</p> }]);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await act(async () => container.querySelector("a")!.click());
    expect(router.state.location.search).toBe("?inspect=1&network=preprod");
    expect(router.state.location.hash).toBe("#cbor");
    expect(router.state.location.state).toEqual(state);
  } finally { await act(async () => root.unmount()); router.dispose(); }
});
it.each(["https://example.com/page?x=1#anchor", "//example.com/path", "mailto:pool@example.com", "#holder-actions"])("leaves external or hash-only destination %s unchanged", (href) => {
  expect(networkHref(href)).toBe(href);
});
it("preserves an explicit destination context instead of silently rewriting invalid or other-network URLs", () => {
  expect(networkHref("/explorer?network=preview")).toBe("/explorer?network=preview");
  expect(networkHref("/explorer?network=invalid")).toBe("/explorer?network=invalid");
  expect(networkTo({ hash: "#section" })).toEqual({ hash: "#section" });
});
