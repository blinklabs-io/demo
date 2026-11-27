import { expect, it, vi, afterEach } from "vitest";
afterEach(() => { window.history.replaceState(null, "", "/"); localStorage.clear(); vi.resetModules(); });
it.each([
  ["prime-testnet", 0],
  ["prime-mainnet", 1],
] as const)("formats %s native units as AP3X with network ID %i", async (network, networkId) => {
  window.history.replaceState(null, "", `/?network=${network}`);
  vi.resetModules();
  const { formatNativeCoin, formatAda, nativeTicker } = await import("./format");
  const { CARDANO_NETWORK_ID } = await import("./dingo/networkIdentity");
  const { compactAda } = await import("./visualFormat");
  const { marketAssetName } = await import("../components/markets/amounts");
  expect(marketAssetName("lovelace")).toBe("AP3X");
  expect(nativeTicker()).toBe("AP3X");
  expect(formatNativeCoin(1500000n)).toBe("1.50 AP3X");
  expect(formatAda(1500000n)).toBe("1.50 ADA");
  expect(compactAda(1000000000000n)).toBe("1M AP3X");
  expect(CARDANO_NETWORK_ID).toBe(networkId);
});
