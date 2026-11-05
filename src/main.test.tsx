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
it("loads explicit Preprod context even when browser persistence is blocked", async () => {
  window.history.replaceState(null, "", "/explorer/tx/shared?network=preprod");
  const storage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  try {
    await import("./main");
    await vi.waitFor(() => expect(boundary.render).toHaveBeenCalledOnce());
    expect(renderToStaticMarkup(boundary.render.mock.calls[0][0])).toContain("Application");
    expect(fetch).not.toHaveBeenCalled();
  } finally { storage.mockRestore(); }
});

it("renders a reload action if the application chunk cannot load", async () => {
  vi.doMock("./App.tsx", () => { throw new Error("Chunk unavailable"); });
  try {
    await import("./main");
    await vi.waitFor(() => expect(boundary.render).toHaveBeenCalledOnce());
    const html = renderToStaticMarkup(boundary.render.mock.calls[0][0]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reload workspace");
  } finally {
    vi.doMock("./App.tsx", () => { boundary.appImported(); return { default: () => <div>Application</div> }; });
  }
});
