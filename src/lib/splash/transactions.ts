import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import { getBlaze } from "../dingo/blaze";
import type { Cip30WalletApi } from "../dingo/cip30";
import { blockfrostFetch } from "../dingo/blockfrost";
import { assertWalletSession, assertTransactionNetwork } from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { pd } from "../kernel/actions";
import { SPLASH_ORDER_HASH, SPLASH_REFERENCE, createSplashOrder, splashPlan, type SplashTerms } from "./data";
import { assertSplashMainnet, readSplashOrder, splashInput } from "./read";

export type SplashAction = { kind: "create"; terms: SplashTerms } | { kind: "cancel"; outpoint: string };
async function identity(api: Cip30WalletApi, guard: () => void) {
  await assertWalletSession(api, guard);
  const address = Core.Address.fromBytes(Core.HexBlob(await api.getChangeAddress())); guard();
  const key = address.getProps().paymentPart;
  if (address.getNetworkId() !== 1 || key?.type !== Core.CredentialType.KeyHash) throw new Error("Connect a mainnet wallet with a payment signing key.");
  return { address, key: String(key.hash) };
}
async function slot(guard: () => void) {
  const tip = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"); guard();
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0 || tip.slot > Number.MAX_SAFE_INTEGER - 600) throw new Error("Dingo returned an invalid mainnet tip.");
  return tip.slot;
}
export async function prepareSplashAction(api: Cip30WalletApi, action: SplashAction, guard: () => void) {
  if (action.kind === "create") splashPlan(action.terms);
  await assertSplashMainnet();
  const owner = await identity(api, guard), { blaze } = await getBlaze(api); guard();
  const referenceInput = splashInput(`${SPLASH_REFERENCE}#0`);
  const references = await blaze.provider.resolveUnspentOutputs([referenceInput]); guard();
  if (references.length !== 1 || references[0].input().toCbor() !== referenceInput.toCbor() || references[0].output().address().getNetworkId() !== 1 || references[0].output().scriptRef()?.hash() !== SPLASH_ORDER_HASH)
    throw new Error("Dingo did not verify the deployed Splash cancellation script.");
  const builder = blaze.newTransaction(), contractInputs: Core.TransactionUnspentOutput[] = [references[0]];
  let output: Core.TransactionOutput, signer = owner.key, beacon: string | undefined;
  if (action.kind === "create") {
    const available = await blaze.wallet.getUnspentOutputs(); guard();
    if (!available.length) throw new Error("The wallet has no funding output for the Splash order beacon.");
    const seed = available[0];
    const plan = createSplashOrder(action.terms, owner.address, seed.input());
    output = plan.output; beacon = plan.beacon;
    builder.addInput(seed);
  } else {
    const order = await readSplashOrder(action.outpoint); guard();
    const addresses = [owner.address.toBytes(), ...await api.getUsedAddresses(), ...await api.getUnusedAddresses()]; guard();
    if (!addresses.some((hex) => { const address = Core.Address.fromBytes(Core.HexBlob(hex)); return address.getNetworkId() === 1 && address.getProps().paymentPart?.type === Core.CredentialType.KeyHash && address.getProps().paymentPart?.hash === order.cancelKey; }))
      throw new Error("This wallet does not own the Splash cancellation key.");
    signer = order.cancelKey;
    output = new Core.TransactionOutput(order.owner, Core.Value.fromCbor(order.utxo.output().amount().toCbor()));
    builder.addInput(order.utxo, pd.con(0)).addReferenceInput(references[0]);
    contractInputs.push(order.utxo);
  }
  const minimum = calculateMinAda(output, blaze.params.coinsPerUtxoByte);
  if (output.amount().coin() < minimum) throw new Error(`The Splash output needs at least ${minimum} lovelace. Increase its additional ADA funding.`);
  const validUntil = (await slot(guard)) + 600;
  const tx = await builder.addOutput(Core.TransactionOutput.fromCbor(output.toCbor())).addRequiredSigner(Core.Ed25519KeyHashHex(signer)).setValidUntil(Core.Slot(validUntil)).complete(); guard();
  if (!tx.isValid() || tx.body().outputs()[0]?.toCbor() !== output.toCbor() || tx.body().mint()?.size || tx.body().outputs().slice(1).some((change) => change.address().toBytes() !== owner.address.toBytes()) || (tx.body().collateralReturn() && tx.body().collateralReturn()!.address().toBytes() !== owner.address.toBytes()))
    throw new Error("The built Splash transaction differs from the reviewed outputs.");
  const funding = await assertTransactionNetwork(tx, guard, blaze.provider);
  const keys = [...new Set([signer, ...funding.flatMap((utxo) => { const key = utxo.output().address().getProps().paymentPart; return key?.type === Core.CredentialType.KeyHash ? [String(key.hash)] : []; })])];
  const snapshot = [...new Map([...funding, ...contractInputs].map((utxo) => [utxo.input().toCbor(), utxo.toCbor()])).values()];
  return { tx, blaze, output, beacon, validUntil, owner: owner.address.toBytes(), keys, snapshot, body: tx.body().toCbor(), auxiliary: tx.auxiliaryData()?.toCbor() };
}
export type SplashDraft = Awaited<ReturnType<typeof prepareSplashAction>>;
export async function submitSplashAction(api: Cip30WalletApi, draft: SplashDraft, guard: () => void) {
  const current = async () => {
    await assertSplashMainnet();
    if ((await identity(api, guard)).address.toBytes() !== draft.owner) throw new Error("Wallet account changed. Build a new Splash transaction.");
    if ((await slot(guard)) >= draft.validUntil) throw new Error("Splash draft expired. Build a new transaction.");
    const original = draft.snapshot.map((cbor) => Core.TransactionUnspentOutput.fromCbor(cbor));
    const actual = await draft.blaze.provider.resolveUnspentOutputs(original.map((utxo) => utxo.input())); guard();
    if (actual.length !== original.length || original.some((expected) => !actual.some((utxo) => utxo.toCbor() === expected.toCbor()))) throw new Error("Splash funding, order, or reference inputs changed or were spent.");
  };
  await current();
  if (!draft.tx.isValid() || draft.tx.body().toCbor() !== draft.body || draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("The reviewed Splash transaction changed.");
  const signed = await draft.blaze.signTransaction(Core.Transaction.fromCbor(draft.tx.toCbor()));
  await current();
  if (!signed.isValid() || signed.body().toCbor() !== draft.body || signed.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("Wallet changed the reviewed Splash transaction.");
  for (const key of draft.keys) assertSignedWithKey(signed, key, "Wallet did not sign every Splash funding key.");
  await assertTransactionNetwork(signed, guard, draft.blaze.provider);
  return String(await draft.blaze.provider.postTransactionToChain(signed, guard));
}
