import { DINGO_NETWORK } from "./config";
import { assertSignedWithKey } from "./signatureWitness";
import { Core } from "@blaze-cardano/sdk";
import {
  getBlaze,
  stakeCredentialFromRewardAddress,
  credentialFromDRepId,
} from "./blaze";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import type { Cip30WalletApi } from "./cip30";
import {
  assertTransactionNetwork,
  assertDingoTransactionBackends,
  assertWalletSession,
} from "./walletSession";

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
    assertDingoTransactionBackends(),
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
async function validateTarget(
  target: DelegationTarget,
  epoch: number,
  assertCurrent: () => void,
) {
  assertCurrent();
  try {
    if (target.kind === "drep") {
      const row = await blockfrostFetch<{ drep_id: string; retired: boolean }>(
        `/api/v0/governance/dreps/${encodeURIComponent(target.id)}`,
      );
      assertCurrent();
      const expected = credentialFromDRepId(target.id).toCore();
      const actual = credentialFromDRepId(row.drep_id).toCore();
      if (
        actual.hash !== expected.hash ||
        actual.type !== expected.type ||
        typeof row.retired !== "boolean"
      )
        throw new Error("Dingo returned an invalid DRep target.");
      if (row.retired)
        throw new Error("That DRep is retired. Choose a registered DRep.");
      return;
    }
    const pool = Core.PoolId(target.id);
    const row = await blockfrostFetch<{
      pool_id: string;
      registration: string[];
    }>(`/api/v0/pools/${encodeURIComponent(pool)}`);
    assertCurrent();
    if (
      Core.PoolId.toKeyHash(Core.PoolId(row.pool_id)) !==
        Core.PoolId.toKeyHash(pool) ||
      !Array.isArray(row.registration) ||
      !row.registration.length
    )
      throw new Error("Dingo did not verify this pool's registration.");
    // Pool detail includes inactive pools; certificate order determines current registration.
    const events = await blockfrostFetch<
      { tx_hash: string; cert_index: number; action: string }[]
    >(`/api/v0/pools/${pool}/updates?count=1&order=desc`);
    assertCurrent();
    const event = events[0];
    if (
      events.length !== 1 ||
      !event ||
      !/^[0-9a-f]{64}$/i.test(event.tx_hash) ||
      !Number.isSafeInteger(event.cert_index) ||
      event.cert_index < 0
    )
      throw new Error(
        "Dingo did not return the pool's latest registration state.",
      );
    if (event.action === "registered") return;
    if (event.action !== "deregistered")
      throw new Error("Dingo returned an invalid pool registration event.");
    // Announced retirements take effect in their declared epoch.
    const response = await blockfrostFetch<{ cbor: string }>(
      `/api/v0/txs/${event.tx_hash}/cbor`,
    );
    assertCurrent();
    if (
      !/^(?:[0-9a-f]{2})+$/i.test(response.cbor) ||
      response.cbor.length > 262144
    )
      throw new Error("Dingo returned invalid pool retirement data.");
    const tx = Core.Transaction.fromCbor(Core.TxCBOR(response.cbor));
    const retirement = tx
      .body()
      .certs()
      ?.values()
      .at(event.cert_index)
      ?.asPoolRetirement();
    if (
      String(tx.getId()) !== event.tx_hash ||
      !retirement ||
      retirement.poolKeyHash() !== Core.PoolId.toKeyHash(pool) ||
      !Number.isSafeInteger(retirement.epoch())
    )
      throw new Error("Dingo did not verify the pool retirement certificate.");
    if (retirement.epoch() <= epoch)
      throw new Error("That stake pool has retired. Choose a registered pool.");
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404)
      throw new Error(
        target.kind === "pool"
          ? `That stake pool is not registered on ${DINGO_NETWORK.label}.`
          : `That DRep is not registered on ${DINGO_NETWORK.label}.`,
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
    blockfrostFetch<{ slot: number; epoch: number }>("/api/v0/blocks/latest"),
  ]);
  assertCurrent();
  if (
    typeof account.registered !== "boolean" ||
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    !Number.isSafeInteger(tip.epoch) ||
    tip.epoch < 0
  )
    throw new Error("Dingo returned invalid delegation state.");
  await validateTarget({ ...target, id }, tip.epoch, assertCurrent);
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
  await assertTransactionNetwork(tx, assertCurrent);
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
    blockfrostFetch<{ slot: number; epoch: number }>("/api/v0/blocks/latest"),
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
  if (!Number.isSafeInteger(tip.epoch) || tip.epoch < 0)
    throw new Error("Dingo returned an invalid current epoch.");
  await validateTarget(draft.target, tip.epoch, assertCurrent);
  await assertWalletSession(api, assertCurrent);
  const expectedId = draft.tx.getId();
  await assertTransactionNetwork(draft.tx, assertCurrent);
  const signed = await draft.blaze.signTransaction(draft.tx);
  await assertWalletSession(api, assertCurrent);
  await assertTransactionNetwork(signed, assertCurrent);
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
  return String(
    await draft.blaze.provider.postTransactionToChain(signed, assertCurrent),
  );
}
