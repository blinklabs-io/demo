import { expect, it, vi } from "vitest";
import { assertWalletSession } from "./walletSession";

it("rejects a departed session before accessing the wallet", async () => {
  const getNetworkId = vi.fn(async () => 0);
  await expect(
    assertWalletSession({ getNetworkId }, () => {
      throw new Error("Session changed");
    }),
  ).rejects.toThrow("Session changed");
  expect(getNetworkId).not.toHaveBeenCalled();
});
it("rejects a session change while the wallet network read is pending", async () => {
  let active = true;
  let complete!: (network: number) => void;
  const result = assertWalletSession(
    {
      getNetworkId: () =>
        new Promise<number>((resolve) => {
          complete = resolve;
        }),
    },
    () => {
      if (!active) throw new Error("Session changed");
    },
  );
  active = false;
  complete(0);
  await expect(result).rejects.toThrow("Session changed");
});
it("rejects a live mainnet wallet even when application connection state remains unchanged", async () => {
  await expect(
    assertWalletSession({ getNetworkId: async () => 1 }, () => {}),
  ).rejects.toThrow("testnet");
});
