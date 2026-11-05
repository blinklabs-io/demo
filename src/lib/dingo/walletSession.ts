import type { Cip30WalletApi } from "./cip30";

export async function assertWalletSession(
  wallet: Pick<Cip30WalletApi, "getNetworkId">,
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const network = await wallet.getNetworkId();
  assertCurrent();
  if (network !== 0)
    throw new Error(
      "Wallet network changed. Connect a testnet wallet and review a new transaction.",
    );
}
