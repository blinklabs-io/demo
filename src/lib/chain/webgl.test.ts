import { afterEach, expect, it, vi } from "vitest";
import { canUseWebGL, resetWebGLProbe } from "./webgl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetWebGLProbe();
});

it("is false when the API is missing", () => {
  expect(canUseWebGL()).toBe(false);
});

it("is false when the API exists but no context can be created", () => {
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  expect(canUseWebGL()).toBe(false);
});

it("is false when creating the context throws", () => {
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(canUseWebGL()).toBe(false);
});

it("is true when a context is created", () => {
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => null,
  } as unknown as RenderingContext);
  expect(canUseWebGL()).toBe(true);
});
