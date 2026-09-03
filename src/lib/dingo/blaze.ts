import { Blaze, WebWallet } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "./cip30";
import { getDingoProvider } from "./utxorpc/provider";

// Wraps a connected CIP-30 wallet API in Blaze's WebWallet, then combines it
// with the shared Dingo UTxO RPC provider into a Blaze instance ready to
// build, sign, and submit transactions.
export async function getBlaze(walletApi: Cip30WalletApi) {
  const webWallet = new WebWallet(
    walletApi as unknown as ConstructorParameters<typeof WebWallet>[0],
  );
  const blaze = await Blaze.from(getDingoProvider(), webWallet);
  return { blaze, webWallet };
}
