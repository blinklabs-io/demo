import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import NetworkRecovery from "./NetworkRecovery";
it("replaces an invalid URL context with an explicit valid recovery choice", async () => {
  const realWindow = window;
  realWindow.history.replaceState(null, "", "/explorer/tx/old?network=invalid");
  localStorage.setItem("dingo.network", "invalid");
  const assign = vi.fn();
  vi.stubGlobal("window", new Proxy(realWindow, { get(target, key) {
    return key === "location" ? { assign } : Reflect.get(target, key, target);
  } }));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NetworkRecovery />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Preprod")!.click());
    expect(assign).toHaveBeenCalledWith("/?network=preprod");
    expect(localStorage.getItem("dingo.network")).toBe("preprod");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    localStorage.clear();
    realWindow.history.replaceState(null, "", "/");
  }
});
