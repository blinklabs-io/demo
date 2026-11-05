import { kernelLifecyclePlan, type KernelLifecycle } from "./lifecycle";
import { closeKernelPlan } from "./close";
import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  assertTransactionNetwork,
  assertWalletSession,
} from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { createKernelPlan, type KernelCreation } from "./actions";
import {
  kernelReferences,
  kernelReferencesForLanes,
  type KernelRecord,
} from "./markets";
import { quoteKernelSwap } from "./swap";
import { assertKernelNetwork, KERNEL_LANES } from "./protocol";
export type KernelAction =
  | KernelCreation
  | KernelLifecycle
  | { kind: "close-position"; record: KernelRecord }
  | {
      kind: "swap";
      record: KernelRecord;
      take: bigint;
      side?: 1 | 2;
      extraAda?: bigint;
    };
export async function prepareKernelTransaction(
  api: Cip30WalletApi,
  action: KernelAction,
  assertCurrent: () => void,
) {
  assertKernelNetwork();
  await assertWalletSession(api, assertCurrent);
  const { blaze } = await getBlaze(api);
  assertCurrent();
  const payment = await blaze.wallet.getChangeAddress();
  assertCurrent();
  const tip = await blockfrostFetch<{ slot: number; time: number }>(
    "/api/v0/blocks/latest",
  );
  assertCurrent();
  if (
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    !Number.isSafeInteger(tip.time) ||
    tip.time < 0
  )
    throw new Error("Dingo returned an invalid build tip.");
  const builder = blaze.newTransaction();
  let validUntil = tip.slot + 600,
    requiredKey: string | undefined,
    description: string,
    expected: Core.TransactionOutput | undefined;
  const expectedOutputs: Core.TransactionOutput[] = [];
  if (isLifecycle(action)) {
    const rewards = await api.getRewardAddresses();
    assertCurrent();
    const stake = rewards[0]
      ? Core.Address.fromBytes(Core.HexBlob(rewards[0]))
          .asReward()
          ?.getPaymentCredential()
      : undefined;
    const plan = kernelLifecyclePlan(
      action,
      stake?.type === Core.CredentialType.KeyHash
        ? String(stake.hash)
        : undefined,
      tip.time * 1000,
    );
    requiredKey = plan.requiredKey;
    description = plan.description;
    const references = new Map<string, Core.TransactionUnspentOutput>();
    const verifiedRefs = await kernelReferencesForLanes(
      plan.references,
      blaze.provider,
    );
    assertCurrent();
    for (const ref of verifiedRefs)
      references.set(
        `${ref.input().transactionId()}#${ref.input().index()}`,
        ref,
      );
    if (plan.observer) {
      const ref = await blaze.provider.resolveUnspentOutputs([
        new Core.TransactionInput(Core.TransactionId(plan.observer.ref), 0n),
      ]);
      assertCurrent();
      if (
        ref.length !== 1 ||
        ref[0].input().transactionId() !== plan.observer.ref ||
        ref[0].input().index() !== 0n ||
        ref[0].output().address().getNetworkId() !== 0 ||
        ref[0].output().scriptRef()?.hash() !== plan.observer.hash
      )
        throw new Error(
          "Dingo could not verify the Kernel observer reference.",
        );
      references.set(plan.observer.ref + "#0", ref[0]);
      const address = Core.RewardAddress.fromCredentials(0, {
        type: Core.CredentialType.ScriptHash,
        hash: Core.Hash28ByteBase16(plan.observer.hash),
      }).toAddress();
      builder.addWithdrawal(
        Core.RewardAccount(address.toBech32()),
        0n,
        plan.observer.redeemer,
      );
    }
    references.forEach((ref) => builder.addReferenceInput(ref));
    const inputs = await blaze.provider.resolveUnspentOutputs(
      plan.inputs.map((input) => input.record.utxo.input()),
    );
    assertCurrent();
    if (inputs.length !== plan.inputs.length)
      throw new Error("Position inputs are no longer available.");
    for (const input of plan.inputs) {
      const current = inputs.find(
        (value) =>
          value.input().toCbor() === input.record.utxo.input().toCbor(),
      );
      if (
        !current ||
        current.output().toCbor() !== input.record.utxo.output().toCbor()
      )
        throw new Error("Position changed or was spent. Reload the market.");
      builder.addInput(current, input.redeemer);
    }
    for (const minted of plan.mints)
      builder.addMint(
        Core.PolicyId(KERNEL_LANES[minted.lane].beaconPolicy),
        minted.assets,
        minted.redeemer,
      );
    if (requiredKey)
      builder.addRequiredSigner(Core.Ed25519KeyHashHex(requiredKey));
    for (const output of plan.outputs) {
      expectedOutputs.push(output);
      builder.addOutput(Core.TransactionOutput.fromCbor(output.toCbor()));
    }
    if (plan.start !== undefined) builder.setValidFrom(Core.Slot(tip.slot));
    if (plan.expiration !== undefined) {
      validUntil = Math.min(
        validUntil,
        tip.slot + Math.floor(plan.expiration / 1000 - tip.time),
      );
      if (validUntil <= tip.slot + 1)
        throw new Error("Position deadline is too close to build safely.");
    }
  } else if (action.kind === "close-position") {
    const rewards = await api.getRewardAddresses();
    assertCurrent();
    const stake = rewards[0]
      ? Core.Address.fromBytes(Core.HexBlob(rewards[0]))
          .asReward()
          ?.getPaymentCredential()
      : undefined;
    if (!stake || stake.type !== Core.CredentialType.KeyHash)
      throw new Error("A wallet stake key is required to close this position.");
    const stakeHash = String(stake.hash);
    requiredKey = stakeHash;
    const plan = closeKernelPlan(action.record, stakeHash);
    const refs = await kernelReferences(action.record.lane, blaze.provider);
    assertCurrent();
    refs.forEach((ref) => builder.addReferenceInput(ref));
    const current = await blaze.provider.resolveUnspentOutputs([
      action.record.utxo.input(),
    ]);
    assertCurrent();
    if (
      current.length !== 1 ||
      current[0].output().toCbor() !== action.record.utxo.output().toCbor()
    )
      throw new Error("Position changed or was spent. Reload the market.");
    builder
      .addInput(current[0], plan.spendRedeemer)
      .addMint(
        Core.PolicyId(KERNEL_LANES[action.record.lane].beaconPolicy),
        plan.mint,
        plan.mintRedeemer,
      )
      .addRequiredSigner(Core.Ed25519KeyHashHex(stakeHash));
    description =
      "Close your Kernel position and return its assets to your wallet";
  } else if (action.kind === "swap") {
    const refs = await kernelReferences(action.record.lane, blaze.provider);
    assertCurrent();
    refs.forEach((ref) => builder.addReferenceInput(ref));
    const current = await blaze.provider.resolveUnspentOutputs([
      action.record.utxo.input(),
    ]);
    assertCurrent();
    if (
      current.length !== 1 ||
      current[0].output().toCbor() !== action.record.utxo.output().toCbor()
    )
      throw new Error("Swap output changed or was spent. Reload the market.");
    const quote = quoteKernelSwap(
      action.record,
      action.take,
      action.side ?? 1,
      action.extraAda ?? 0n,
    );
    expected = new Core.TransactionOutput(quote.address, quote.value);
    expected.setDatum(Core.Datum.newInlineData(quote.datum));
    builder
      .addInput(current[0], quote.redeemer)
      .addOutput(Core.TransactionOutput.fromCbor(expected.toCbor()));
    description = `Swap ${quote.paid} raw ask units for ${quote.take} raw offered units`;
  } else {
    const rewards = await api.getRewardAddresses();
    assertCurrent();
    const reward = rewards[0]
      ? Core.Address.fromBytes(Core.HexBlob(rewards[0])).asReward()
      : undefined;
    const stake = reward?.getPaymentCredential();
    if (!stake || stake.type !== Core.CredentialType.KeyHash)
      throw new Error(
        "A wallet stake signing key is required to create Kernel positions.",
      );
    const plan = createKernelPlan(action, payment, stake.hash);
    requiredKey = plan.requiredKey;
    description = plan.description;
    const refs = await kernelReferences(plan.lane, blaze.provider);
    assertCurrent();
    refs.forEach((ref) => builder.addReferenceInput(ref));
    if (plan.expiration !== undefined) {
      // Normalize the current-era slot clock from an actual block, avoiding Byron-era genesis offsets.
      const expirySlot =
        tip.slot + Math.floor(plan.expiration / 1000 - tip.time);
      validUntil = Math.min(validUntil, expirySlot);
      if (validUntil <= tip.slot + 1)
        throw new Error(
          "Options expiration must be later than the current chain tip.",
        );
    }
    builder
      .addRequiredSigner(Core.Ed25519KeyHashHex(requiredKey))
      .addMint(
        Core.PolicyId(KERNEL_LANES[plan.lane].beaconPolicy),
        plan.mint,
        plan.redeemer,
      );
    expected = new Core.TransactionOutput(plan.address, plan.value);
    expected.setDatum(Core.Datum.newInlineData(plan.datum));
    builder.addOutput(Core.TransactionOutput.fromCbor(expected.toCbor()));
  }
  if (expected) expectedOutputs.push(expected);
  for (const output of expectedOutputs) {
    const minimum = calculateMinAda(output, blaze.params.coinsPerUtxoByte);
    if (output.amount().coin() < minimum)
      throw new Error(
        `Output requires at least ${minimum} lovelace. Increase its explicit ADA deposit.`,
      );
  }
  builder.setValidUntil(Core.Slot(validUntil));
  const tx = await builder.complete();
  assertCurrent();
  for (let index = 0; index < expectedOutputs.length; index++) {
    const actual = tx.body().outputs()[index],
      intended = expectedOutputs[index];
    if (!actual || actual.toCbor() !== intended.toCbor())
      throw new Error(
        "Reviewed contract or payment output changed during balancing. Increase its deposit or reduce the amount taken.",
      );
  }
  if (
    tx
      .body()
      .outputs()
      .slice(expectedOutputs.length)
      .some((output) => output.address().toBech32() !== payment.toBech32())
  )
    throw new Error("Remaining transaction assets must return to this wallet.");
  const actual = tx.body().outputs()[0];
  await assertTransactionNetwork(tx, assertCurrent, blaze.provider);
  return {
    outputs: expectedOutputs,
    tx,
    blaze,
    cbor: tx.toCbor(),
    fee: tx.body().fee(),
    description,
    validUntil,
    requiredKey,
    paymentAddress: payment.toBech32(),
    output: actual,
  };
}
export type KernelDraft = Awaited<ReturnType<typeof prepareKernelTransaction>>;
export async function submitKernelTransaction(
  api: Cip30WalletApi,
  draft: KernelDraft,
  assertCurrent: () => void,
) {
  assertKernelNetwork();
  await assertWalletSession(api, assertCurrent);
  const current = await draft.blaze.wallet.getChangeAddress();
  assertCurrent();
  if (current.toBech32() !== draft.paymentAddress)
    throw new Error("Wallet account changed. Build a new transaction.");
  const tip = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest");
  assertCurrent();
  if (
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    tip.slot >= draft.validUntil
  )
    throw new Error("Kernel draft expired. Build a new transaction.");
  await assertTransactionNetwork(draft.tx, assertCurrent, draft.blaze.provider);
  const id = draft.tx.getId();
  const signed = await draft.blaze.signTransaction(
    Core.Transaction.fromCbor(draft.tx.toCbor()),
  );
  await assertWalletSession(api, assertCurrent);
  const afterAddress = await draft.blaze.wallet.getChangeAddress();
  assertCurrent();
  if (afterAddress.toBech32() !== draft.paymentAddress)
    throw new Error("Wallet account changed while signing.");
  if (signed.getId() !== id)
    throw new Error("Wallet changed the reviewed transaction.");
  if (draft.requiredKey)
    assertSignedWithKey(
      signed,
      draft.requiredKey,
      "Wallet did not sign with the required stake key.",
    );
  await assertTransactionNetwork(signed, assertCurrent, draft.blaze.provider);
  const afterTip = await blockfrostFetch<{ slot: number }>(
    "/api/v0/blocks/latest",
  );
  assertCurrent();
  if (
    !Number.isSafeInteger(afterTip.slot) ||
    afterTip.slot < 0 ||
    afterTip.slot >= draft.validUntil
  )
    throw new Error(
      "Kernel draft expired while signing. Build a new transaction.",
    );
  return String(
    await draft.blaze.provider.postTransactionToChain(signed, assertCurrent),
  );
}

function isLifecycle(action: KernelAction): action is KernelLifecycle {
  return [
    "loan-accrue",
    "loan-claim",
    "option-expired-close",
    "option-purchase",
    "option-exercise",
    "spot-purchase",
    "loan-accept",
    "loan-repay",
  ].includes(action.kind);
}
