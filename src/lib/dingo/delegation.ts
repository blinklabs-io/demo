import { Core } from "@blaze-cardano/sdk";
import {
  getBlaze,
  stakeCredentialFromRewardAddress,
  credentialFromDRepId,
} from "./blaze";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import type { Cip30WalletApi } from "./cip30";
import { assertSignedWithKey } from "./signatureWitness";
import { assertWalletSession } from "./walletSession";
import { assertDingoNetwork, getDingoProvider } from "./utxorpc/provider";

export type DelegationTarget = { kind: "pool" | "drep"; id: string };
export interface DelegationAccount {
  registered: boolean;
  pool_id: string | null;
  drep_id: string | null;
}
export async function delegationAccount(
  address: string,
): Promise<DelegationAccount> {
  try {
    return await blockfrostFetch<DelegationAccount>(
      `/api/v0/accounts/${address}`,
    );
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404)
      return { registered: false, pool_id: null, drep_id: null };
    throw error;
  }
}
async function identity(
  api: Cip30WalletApi,
  address: string,
  assertCurrent: () => void,
) {
  await assertWalletSession(api, assertCurrent);
  const [rewards, change] = await Promise.all([
    api.getRewardAddresses(),
    api.getChangeAddress(),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertCurrent();
  const reward = Core.Address.fromBech32(address);
  if (
    reward.getNetworkId() !== 0 ||
    !rewards.some(
      (raw) => Core.Address.fromBytes(Core.HexBlob(raw)).toBech32() === address,
    )
  )
    throw new Error("Wallet account changed. Review a new delegation.");
  const credential = reward.asReward()?.getPaymentCredential();
  if (credential?.type !== Core.CredentialType.KeyHash)
    throw new Error("Delegation requires a wallet stake signing key.");
  const changeAddress = Core.Address.fromBytes(Core.HexBlob(change));
  if (changeAddress.getNetworkId() !== 0)
    throw new Error("Connect a testnet wallet.");
  return { stakeHash: credential.hash, change };
}
async function assertTargetRegistered(kind: DelegationTarget["kind"], id: string) {
  try {
    await blockfrostFetch(
      kind === "pool"
        ? `/api/v0/pools/${encodeURIComponent(id)}`
        : `/api/v0/governance/dreps/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404)
      throw new Error(
        kind === "pool"
          ? "That stake pool is not registered."
          : "That DRep is not registered.",
        { cause: error },
      );
    throw error;
  }
}
export async function prepareDelegation(
  api: Cip30WalletApi,
  address: string,
  target: DelegationTarget,
  assertCurrent: () => void,
) {
  const who = await identity(api, address, assertCurrent);
  const id = target.id.trim();
  if (!id)
    throw new Error(
      target.kind === "pool" ? "Enter a stake pool ID." : "Enter a DRep ID.",
    );
  const credential = stakeCredentialFromRewardAddress(address);
  const drep = target.kind === "drep" ? credentialFromDRepId(id) : null;
  const pool = target.kind === "pool" ? Core.PoolId(id) : null;
  const [account, tip] = await Promise.all([
    delegationAccount(address),
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"),
    assertTargetRegistered(target.kind, id),
  ]);
  assertCurrent();
  if (
    typeof account.registered !== "boolean" ||
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0
  )
    throw new Error("Dingo returned invalid delegation state.");
  const { blaze } = await getBlaze(api);
  assertCurrent();
  let builder = blaze.newTransaction();
  if (!account.registered) builder = builder.addRegisterStake(credential);
  builder = pool
    ? builder.addDelegation(credential, pool)
    : builder.addVoteDelegation(credential, drep!);
  const validUntil = tip.slot + 600;
  const tx = await builder.setValidUntil(Core.Slot(validUntil)).complete();
  assertCurrent();
  return {
    tx,
    blaze,
    address,
    target: { ...target, id },
    who,
    registered: account.registered,
    deposit: account.registered ? 0n : BigInt(blaze.params.stakeKeyDeposit),
    validUntil,
  };
}
export type PreparedDelegation = Awaited<ReturnType<typeof prepareDelegation>>;
export async function submitDelegation(
  api: Cip30WalletApi,
  draft: PreparedDelegation,
  assertCurrent: () => void,
) {
  const who = await identity(api, draft.address, assertCurrent);
  if (who.change !== draft.who.change || who.stakeHash !== draft.who.stakeHash)
    throw new Error("Wallet account changed. Review a new delegation.");
  const [account, tip] = await Promise.all([
    delegationAccount(draft.address),
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"),
  ]);
  assertCurrent();
  if (account.registered !== draft.registered)
    throw new Error("Stake registration changed. Review a new delegation.");
  if (
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    tip.slot >= draft.validUntil
  )
    throw new Error("Delegation draft expired. Review a new transaction.");
  await assertWalletSession(api, assertCurrent);
  const expectedId = draft.tx.getId();
  const signed = await draft.blaze.signTransaction(draft.tx);
  await assertWalletSession(api, assertCurrent);
  if (signed.getId() !== expectedId)
    throw new Error(
      "Wallet changed the transaction body. Nothing was submitted.",
    );
  assertSignedWithKey(
    signed,
    who.stakeHash,
    "Wallet did not sign with your stake key. Nothing was submitted.",
  );
  assertCurrent();
  return String(await draft.blaze.submitTransaction(signed, true));
}
