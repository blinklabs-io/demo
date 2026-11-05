import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useDraftGuard } from "./useDraftGuard";

let latest: () => void;
function Probe() {
  const guard = useDraftGuard("fixture");
  const location = useLocation();
  useLayoutEffect(() => {
    latest = guard;
  });
  return <p>{location.pathname}</p>;
}
let root: Root,
  router: ReturnType<typeof createMemoryRouter>,
  container: HTMLDivElement;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  router = createMemoryRouter([{ path: "/:page", element: <Probe /> }], {
    initialEntries: ["/a"],
  });
  await act(async () => root.render(<RouterProvider router={router} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  container.remove();
});
it("cancels a captured approval when navigation commits in the router before React unmounts", async () => {
  const old = latest;
  await act(async () => {
    const pending = router.navigate("/b");
    expect(() => old()).toThrow("Draft details changed");
    await pending;
  });
  expect(() => latest()).not.toThrow();
});
it("does not resurrect an approval after A to B to A navigation before a render commit", async () => {
  const old = latest;
  await act(async () => {
    const away = router.navigate("/b");
    const back = router.navigate("/a");
    expect(() => old()).toThrow("Draft details changed");
    await Promise.all([away, back]);
  });
  expect(() => old()).toThrow("Draft details changed");
  expect(() => latest()).not.toThrow();
});
it("keeps the existing draft valid across hash-only anchors on the same page", async () => {
  const old = latest;
  await act(async () => {
    await router.navigate("/a#rewards");
  });
  expect(() => old()).not.toThrow();
  await act(async () => {
    await router.navigate("/a#votes");
  });
  expect(() => old()).not.toThrow();
});

it("preserves an approval across canonical selected-network metadata addition and removal", async () => {
  const old = latest;
  await act(async () => {
    await router.navigate("/a?network=preview", { replace: true });
  });
  expect(() => old()).not.toThrow();
  await act(async () => { await router.navigate("/a", { replace: true }); });
  expect(() => old()).not.toThrow();
});
it.each(["preprod", "invalid"])("immediately invalidates an approval on explicit other network %s and never revives it", async (network) => {
  const old = latest;
  await act(async () => {
    const away = router.navigate(`/a?network=${network}`);
    expect(() => old()).toThrow("Draft details changed");
    const back = router.navigate("/a?network=preview");
    expect(() => old()).toThrow("Draft details changed");
    await Promise.all([away, back]);
  });
  expect(() => old()).toThrow("Draft details changed");
  expect(() => latest()).not.toThrow();
});
it.each([false, true])("invalidates same-page changed-state navigation when replace=%s", async (replace) => {
  await act(async () => { await router.navigate("/a?network=preview", { replace: true, state: { transactionCbor: "first" } }); });
  const old = latest;
  await act(async () => {
    const pending = router.navigate("/a", { replace, state: { transactionCbor: "second" } });
    expect(() => old()).toThrow("Draft details changed");
    await pending;
  });
  expect(() => old()).toThrow("Draft details changed");
  expect(() => latest()).not.toThrow();
});
it("does not exempt a PUSH merely because it only drops canonical network metadata", async () => {
  await act(async () => { await router.navigate("/a?network=preview", { replace: true }); });
  const old = latest;
  await act(async () => {
    const pending = router.navigate("/a");
    expect(() => old()).toThrow("Draft details changed");
    await pending;
  });
});
