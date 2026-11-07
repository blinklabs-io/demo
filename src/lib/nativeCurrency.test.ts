import { expect, it, vi, afterEach } from "vitest";
afterEach(() => { window.history.replaceState(null, "", "/"); localStorage.clear(); vi.resetModules(); });
it("formats Prime's native units as AP3X while preserving the explicit ADA formatter", async () => {
  window.history.replaceState(null, "", "/?network=prime-testnet");
  vi.resetModules();
  const { formatNativeCoin, formatAda, nativeTicker } = await import("./format");
  const { compactAda } = await import("./visualFormat");
  const { marketAssetName } = await import("../components/markets/amounts");
  expect(marketAssetName("lovelace")).toBe("AP3X");
  expect(nativeTicker()).toBe("AP3X");
  expect(formatNativeCoin(1500000n)).toBe("1.50 AP3X");
  expect(formatAda(1500000n)).toBe("1.50 ADA");
  expect(compactAda(1000000000000n)).toBe("1M AP3X");
});
