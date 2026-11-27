import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { persistDingoNetwork, selectedDingoNetwork } from "./networks";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

it("defaults fresh sessions to Mainnet", () => {
  expect(selectedDingoNetwork()).toEqual({
    id: "mainnet",
    label: "Mainnet",
    networkMagic: 764824073,
  });
});
it("uses explicit URL selection without reading blocked browser storage", () => {
  window.history.replaceState(null, "", "/explorer?network=preprod");
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(selectedDingoNetwork()).toEqual({ id: "preprod", label: "Preprod", networkMagic: 1 });
  expect(persistDingoNetwork("preprod")).toBe(false);
});
it("requires explicit recovery if storage cannot be read and the URL supplies no network", () => {
  window.history.replaceState(null, "", "/");
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(() => selectedDingoNetwork()).toThrow("Blocked");
});
it("rejects invalid explicit URL context even if browser storage is blocked", () => {
  window.history.replaceState(null, "", "/?network=invalid");
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(() => selectedDingoNetwork()).toThrow("valid network in the URL");
});
