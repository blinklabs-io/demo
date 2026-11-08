import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import { assertDingoTransactionBackends, assertTransactionNetwork, assertWalletSession } from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { inputId, walletOutputs } from "../tools/transactions";
import { assertPrime, readBridgeSettings } from "./api";
import { bridgePlan, type BridgeAction } from "./plan";

async function tip(assertCurrent: () => void) {
  const result = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest");
  assertCurrent();
  if (!Number.isSafeInteger(result.slot) || result.slot < 0) throw new Error("Dingo returned invalid Prime timing.");
  return result.slot;
}
async function identity(api: Cip30WalletApi, assertCurrent: () => void) {
  assertPrime();
  await Core.initCrypto();
  assertCurrent();
  await assertWalletSession(api, assertCurrent);
  const address = Core.Address.fromBytes(Core.HexBlob(await api.getChangeAddress()));
  assertCurrent();
  const key = address.getProps().paymentPart;
  if (address.getNetworkId() !== 0 || key?.type !== Core.CredentialType.KeyHash) throw new Error("Connect a Prime Testnet payment wallet.");
  return { address: address.toBech32(), key: String(key.hash) };
}
export async function prepareBridgeTransaction(api: Cip30WalletApi, action: BridgeAction, assertCurrent: () => void) {
  const who = await identity(api, assertCurrent);
  const settings = await readBridgeSettings();
  assertCurrent();
  const plan = bridgePlan(action, who.address, settings);
  const { blaze } = await getBlaze(api);
  assertCurrent();
  if (plan.output.amount().coin() < calculateMinAda(plan.output, blaze.params.coinsPerUtxoByte)) throw new Error("Bridge output is below Prime’s minimum output value.");
  const validUntil = await tip(assertCurrent) + 600;
  const tx = await blaze.newTransaction()
    .addOutput(Core.TransactionOutput.fromCbor(plan.output.toCbor()))
    .setMetadata(plan.metadata)
    .addRequiredSigner(Core.Ed25519KeyHashHex(who.key))
    .setValidUntil(Core.Slot(validUntil)).complete();
  assertCurrent();
  if (tx.body().outputs()[0]?.toCbor() !== plan.output.toCbor() || tx.auxiliaryData()?.metadata()?.toCbor() !== plan.metadata.toCbor())
    throw new Error("Bridge output or routing metadata changed during balancing.");
  if (tx.body().outputs().slice(1).some((output) => output.address().toBech32() !== who.address)) throw new Error("Bridge change must return to the connected wallet.");
  const owned = new Map((await walletOutputs(api)).map((output) => [inputId(output), output]));
  assertCurrent();
  const keys = new Set([who.key]);
  const inputs = [...tx.body().inputs().values()];
  const resolved = await blaze.provider.resolveUnspentOutputs(inputs);
  assertCurrent();
  const verified = new Map(resolved.map((output) => [inputId(output), output]));
  for (const input of inputs) {
    const ref = `${input.transactionId()}#${input.index()}`;
    const output = owned.get(ref), actual = verified.get(ref);
    const key = output?.output().address().getProps().paymentPart;
    if (!output || !actual || output.output().toCbor() !== actual.output().toCbor() || key?.type !== Core.CredentialType.KeyHash || output.output().datum() || output.output().scriptRef())
      throw new Error("Bridge funding must use verified plain outputs from the connected wallet.");
    keys.add(String(key.hash));
  }
  await assertTransactionNetwork(tx, assertCurrent, blaze.provider);
  return { tx, blaze, action: { ...action, address: plan.address }, address: who.address, amount: plan.amount, bridgeFee: plan.fee, keys: [...keys], validUntil, bodyCbor: tx.body().toCbor(), hash: String(tx.getId()), auxiliaryCbor: tx.auxiliaryData()!.toCbor() };
}
export type BridgeDraft = Awaited<ReturnType<typeof prepareBridgeTransaction>>;
export async function submitBridgeTransaction(draft: BridgeDraft, api: Cip30WalletApi, assertCurrent: () => void) {
  const check = async () => {
    await assertDingoTransactionBackends();
    assertCurrent();
    if (draft.tx.body().toCbor() !== draft.bodyCbor || draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliaryCbor) throw new Error("Bridge draft changed. Review a new transaction.");
    const who = await identity(api, assertCurrent);
    if (who.address !== draft.address || await tip(assertCurrent) >= draft.validUntil) throw new Error("Bridge draft expired or wallet changed. Review a new transaction.");
    const settings = await readBridgeSettings();
    assertCurrent();
    const plan = bridgePlan(draft.action, draft.address, settings);
    if (plan.fee !== draft.bridgeFee) throw new Error("Reactor’s bridge fee changed. Review a new transaction.");
    await assertTransactionNetwork(draft.tx, assertCurrent, draft.blaze.provider);
  };
  await check();
  const signed = await draft.blaze.signTransaction(Core.Transaction.fromCbor(draft.tx.toCbor()));
  await check();
  if (signed.body().toCbor() !== draft.bodyCbor || String(signed.getId()) !== draft.hash || signed.auxiliaryData()?.toCbor() !== draft.auxiliaryCbor)
    throw new Error("Wallet changed the reviewed bridge transaction.");
  for (const key of draft.keys) assertSignedWithKey(signed, key, "Wallet did not sign every bridge funding input. Nothing was submitted.");
  await assertTransactionNetwork(signed, assertCurrent, draft.blaze.provider);
  assertCurrent();
  return String(await draft.blaze.provider.postTransactionToChain(signed, assertCurrent));
}
