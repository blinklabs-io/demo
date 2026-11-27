import "@testing-library/jest-dom";
import { afterEach, beforeEach, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
global.fetch = vi.fn();

function selectPreviewTestNetwork() {
  if (typeof localStorage !== "undefined")
    localStorage.setItem("dingo.network", "preview");
}

selectPreviewTestNetwork();
beforeEach(selectPreviewTestNetwork);

afterEach(() => {
  vi.resetAllMocks();
});
