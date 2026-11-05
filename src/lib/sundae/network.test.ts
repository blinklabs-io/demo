// @vitest-environment node
import { expect, it, vi } from "vitest";
import { buildSwapOrder, type BuildSwapArgs } from "./swap";
import { buildV4Swap } from "./v4";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "preprod", label: "Preprod", networkMagic: 1 },
  DINGO_CONFIG: { blockfrostUrl: "http://127.0.0.1:3000", utxorpcUrl: "http://127.0.0.1:9090", meshUrl: "http://127.0.0.1:8080" },
}));
it("rejects Preview V3 deployment construction on Preprod", async () => {
  await expect(buildSwapOrder({} as BuildSwapArgs)).rejects.toThrow("configured for Preview");
});
it("rejects Preview V4 deployment before wallet reads or approval on Preprod", async () => {
  const getBalance = vi.fn(), current = vi.fn();
  const blaze = { wallet: { getBalance } } as unknown as Parameters<typeof buildV4Swap>[0];
  await expect(buildV4Swap(blaze, {} as Parameters<typeof buildV4Swap>[1], 0, 1n, 1n, 0n, current)).rejects.toThrow("configured for Preview");
  expect(getBalance).not.toHaveBeenCalled();
  expect(current).not.toHaveBeenCalled();
});
