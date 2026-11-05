import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ render: vi.fn(), appImported: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: boundary.render }) }));
vi.mock("./App.tsx", () => { boundary.appImported(); return { default: () => <div>Application</div> }; });
afterEach(() => { window.history.replaceState(null, "", "/"); boundary.render.mockClear(); boundary.appImported.mockClear(); localStorage.clear(); vi.resetModules(); });
it("offers an explicit network recovery choice without importing chain-connected application code", async () => {
  localStorage.setItem("dingo.network", "invalid");
  await import("./main");
  expect(boundary.appImported).not.toHaveBeenCalled();
  expect(boundary.render).toHaveBeenCalledOnce();
  const html = renderToStaticMarkup(boundary.render.mock.calls[0][0]);
  expect(html).toContain("Choose a Cardano network");
  expect(html).toContain("Preview");
  expect(html).toContain("Preprod");
  expect(fetch).not.toHaveBeenCalled();
});

it("shows recovery without loading chain code when the URL network is invalid", async () => {
  localStorage.setItem("dingo.network", "preview");
  window.history.replaceState(null, "", "/explorer/tx/hash?network=invalid");
  await import("./main");
  expect(boundary.appImported).not.toHaveBeenCalled();
  const html = renderToStaticMarkup(boundary.render.mock.calls[0][0]);
  expect(html).toContain("Choose a Cardano network");
  expect(fetch).not.toHaveBeenCalled();
});

it("opens a shared Preprod URL ahead of saved Preview and remembers that explicit context before App loads", async () => {
  localStorage.setItem("dingo.network", "preview");
  window.history.replaceState(null, "", "/explorer/tx/shared?network=preprod");
  await import("./main");
  expect(localStorage.getItem("dingo.network")).toBe("preprod");
  await vi.waitFor(() => expect(boundary.render).toHaveBeenCalledOnce());
  expect(renderToStaticMarkup(boundary.render.mock.calls[0][0])).toContain("Application");
  expect(fetch).not.toHaveBeenCalled();
});
