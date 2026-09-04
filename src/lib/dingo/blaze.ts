import { Blaze, Core, WebWallet } from "@blaze-cardano/sdk";
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

// Certificates (stake registration, pool delegation, DRep vote delegation)
// all key off the stake credential itself, not a payment address - derived
// here from the wallet's reward address. A RewardAddress wraps exactly one
// credential; "payment" in getPaymentCredential() is cardano-sdk's generic
// naming for "the credential this address represents", not a payment key.
export function stakeCredentialFromRewardAddress(
  rewardAddress: string,
): Core.Credential {
  const address = Core.Address.fromBech32(rewardAddress).asReward();
  if (!address) {
    throw new Error("Connected wallet has no stake credential.");
  }
  return Core.Credential.fromCore(address.getPaymentCredential());
}

// Decodes a drep1.../drep_script1... (CIP-105 or CIP-129) id into the
// Credential addVoteDelegation expects.
export function credentialFromDRepId(drepId: string): Core.Credential {
  const id = Core.Cardano.DRepID(drepId.trim());
  if (!Core.Cardano.DRepID.isValid(id)) {
    throw new Error("Enter a valid DRep ID (drep1... or drep_script1...).");
  }
  return Core.Credential.fromCore(Core.Cardano.DRepID.toCredential(id));
}
