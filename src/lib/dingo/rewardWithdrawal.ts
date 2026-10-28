import { Core } from "@blaze-cardano/sdk";
import { getBlaze } from "./blaze";
import { blockfrostFetch } from "./blockfrost";
import type { Cip30WalletApi } from "./cip30";
import { walletStakeAccount } from "./wallet";
import { assertDingoNetwork, getDingoProvider } from "./utxorpc/provider";

async function readRewards(
  api: Cip30WalletApi,
  address: string,
  assertConnection: () => void,
) {
  assertConnection();
  const parsed = Core.Address.fromBech32(address);
  const reward = parsed.asReward();
  if (!reward || parsed.getNetworkId() !== Core.NetworkId.Testnet)
    throw new Error("Connect a Preview wallet with a reward address.");
  const credential = reward.getPaymentCredential();
  if (credential.type !== Core.Cardano.CredentialType.KeyHash)
    throw new Error("Reward withdrawals require a wallet stake signing key.");
  const [network, addresses, account, tip] = await Promise.all([
    api.getNetworkId(),
    api.getRewardAddresses(),
    walletStakeAccount(address),
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertConnection();
  if (
    network !== Core.NetworkId.Testnet ||
    !addresses.some(
      (hex) => Core.Address.fromBytes(Core.HexBlob(hex)).toBech32() === address,
    )
  )
    throw new Error(
      "Your wallet account changed. Reconnect and review the withdrawal again.",
    );
  if (account?.stake_address !== address || !account.registered)
    throw new Error("This stake account is not registered.");
  if (!/^\d+$/.test(account.withdrawable_amount))
    throw new Error("Dingo returned an invalid reward balance.");
  const amount = BigInt(account.withdrawable_amount);
  if (amount === 0n)
    throw new Error("There are no rewards available to withdraw.");
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0)
    throw new Error("Dingo returned an invalid tip slot.");
  return { amount, tip, stakeHash: credential.hash };
}

export async function prepareRewardWithdrawal(
  api: Cip30WalletApi,
  address: string,
  assertConnection: () => void,
) {
  const { amount, tip, stakeHash } = await readRewards(
    api,
    address,
    assertConnection,
  );
  const { blaze } = await getBlaze(api);
  assertConnection();
  const validUntil = tip.slot + 600;
  const tx = await blaze
    .newTransaction()
    .addWithdrawal(Core.RewardAccount(address), amount)
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertConnection();
  return { blaze, tx, amount, address, stakeHash, validUntil };
}
export type PreparedWithdrawal = Awaited<
  ReturnType<typeof prepareRewardWithdrawal>
>;

export async function submitRewardWithdrawal(
  api: Cip30WalletApi,
  prepared: PreparedWithdrawal,
  assertConnection: () => void,
) {
  const { amount, tip } = await readRewards(
    api,
    prepared.address,
    assertConnection,
  );
  if (amount !== prepared.amount)
    throw new Error(
      "Your reward balance changed. Create a new withdrawal transaction.",
    );
  if (tip.slot >= prepared.validUntil)
    throw new Error("This withdrawal draft expired. Create a new transaction.");
  const signed = await prepared.blaze.signTransaction(prepared.tx);
  assertConnection();
  const witness = signed
    .witnessSet()
    .vkeys()
    ?.toCore()
    .find(
      ([key]) =>
        Core.Ed25519PublicKey.fromHex(key).hash().hex() === prepared.stakeHash,
    );
  if (
    !witness ||
    !Core.Ed25519PublicKey.fromHex(witness[0]).verify(
      Core.Ed25519Signature.fromHex(witness[1]),
      Core.HexBlob(signed.getId()),
    )
  )
    throw new Error(
      "The wallet did not sign with your stake key. No withdrawal was submitted.",
    );
  return (await prepared.blaze.submitTransaction(signed, true)).toString();
}
