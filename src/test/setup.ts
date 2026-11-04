import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
global.fetch = vi.fn();

afterEach(() => {
  vi.resetAllMocks();
});
