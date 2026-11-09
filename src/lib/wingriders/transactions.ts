import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  assertWalletSession,
  assertTransactionNetwork,
} from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { inputId, walletOutputs } from "../tools/transactions";
import { assertRapidMainnet, readRapidPool } from "./read";
import { RAPID_REFERENCE, RAPID_POOL_HASH, rapidSwapOutput } from "./data";
async function identity(api: Cip30WalletApi, assertCurrent: () => void) {
  await assertWalletSession(api, assertCurrent);
  const address = Core.Address.fromBytes(
    Core.HexBlob(await api.getChangeAddress()),
  );
  assertCurrent();
  const payment = address.getProps().paymentPart;
  if (
    address.getNetworkId() !== 1 ||
    payment?.type !== Core.CredentialType.KeyHash
  )
    throw new Error("Connect a mainnet wallet with a payment signing key.");
  return { address, key: String(payment.hash) };
}
async function slot(assertCurrent: () => void) {
  const tip = await blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest");
  assertCurrent();
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 0)
    throw new Error("Dingo returned an invalid mainnet tip.");
  return tip.slot;
}
export async function prepareRapidSwap(
  api: Cip30WalletApi,
  args: { poolName: string; poolOutpoint: string; aToB: boolean; amount: bigint; minimum: bigint },
  assertCurrent: () => void,
) {
  await assertRapidMainnet();
  const owner = await identity(api, assertCurrent),
    pool = await readRapidPool(args.poolOutpoint);
  if (pool.name !== args.poolName)
    throw new Error("The WingRiders pool identity differs from the reviewed pool.");
  assertCurrent();
  const { output, quote, redeemer } = rapidSwapOutput(
    pool,
    args.aToB,
    args.amount,
  );
  if (args.minimum <= 0n || quote.received < args.minimum)
    throw new Error(
      "The WingRiders Rapid output changed below the reviewed amount. Refresh and review again.",
    );
  const { blaze } = await getBlaze(api);
  const referenceInput = new Core.TransactionInput(
    Core.TransactionId(RAPID_REFERENCE.hash),
    BigInt(RAPID_REFERENCE.index),
  );
  const references = await blaze.provider.resolveUnspentOutputs([
    referenceInput,
  ]);
  assertCurrent();
  if (
    references.length !== 1 ||
    references[0].input().toCbor() !== referenceInput.toCbor() ||
    references[0].output().address().getNetworkId() !== 1 ||
    references[0].output().scriptRef()?.hash() !== RAPID_POOL_HASH
  )
    throw new Error(
      "Dingo did not verify the deployed WingRiders Rapid reference script.",
    );
  if (
    output.amount().coin() <
    calculateMinAda(output, blaze.params.coinsPerUtxoByte)
  )
    throw new Error(
      "The continuing pool would be below its minimum ADA. Reduce the swap.",
    );
  const validUntil = (await slot(assertCurrent)) + 600;
  const tx = await blaze
    .newTransaction()
    .addInput(pool.utxo, redeemer)
    .addReferenceInput(references[0])
    .addOutput(output)
    .addRequiredSigner(Core.Ed25519KeyHashHex(owner.key))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertCurrent();
  if (
    tx.body().outputs()[0]?.toCbor() !== output.toCbor() ||
    tx.body().mint()?.size ||
    tx
      .body()
      .outputs()
      .slice(1)
      .some((o) => o.address().toBytes() !== owner.address.toBytes()) ||
    (tx.body().collateralReturn() &&
      tx.body().collateralReturn()!.address().toBytes() !==
        owner.address.toBytes())
  )
    throw new Error(
      "The built WingRiders Rapid transaction differs from the reviewed swap.",
    );
  if (
    !tx
      .body()
      .requiredSigners()
      ?.toCore()
      .includes(Core.Ed25519KeyHashHex(owner.key))
  )
    throw new Error("WingRiders Rapid transaction omitted the wallet signer.");
  const owned = await walletOutputs(api);
  for (const cbor of (await api.getCollateral()) ?? [])
    owned.push(Core.TransactionUnspentOutput.fromCbor(Core.HexBlob(cbor)));
  assertCurrent();
  const byId = new Map(owned.map((utxo) => [inputId(utxo), utxo])),
    keys = new Set<string>([owner.key]);
  for (const input of [
    ...tx.body().inputs().values(),
    ...(tx.body().collateral()?.values() ?? []),
  ]) {
    if (input.toCbor() === pool.utxo.input().toCbor()) continue;
    const funding = byId.get(`${input.transactionId()}#${input.index()}`),
      address = funding?.output().address(),
      payment = address?.getProps().paymentPart;
    if (
      address?.getNetworkId() !== 1 ||
      payment?.type !== Core.CredentialType.KeyHash
    )
      throw new Error("The swap uses funding outside the connected wallet.");
    keys.add(String(payment.hash));
  }
  if (
    (await identity(api, assertCurrent)).address.toBytes() !==
    owner.address.toBytes()
  )
    throw new Error("Wallet account changed. Review a new swap.");
  await assertTransactionNetwork(tx, assertCurrent, blaze.provider);
  return {
    tx,
    blaze,
    quote,
    validUntil,
    owner: owner.address.toBytes(),
    keys: [...keys],
    inputs: [pool.utxo, references[0]],
    body: tx.body().toCbor(),
    auxiliary: tx.auxiliaryData()?.toCbor(),
  };
}
export type PreparedRapidSwap = Awaited<ReturnType<typeof prepareRapidSwap>>;
async function unchanged(draft: PreparedRapidSwap, assertCurrent: () => void) {
  const actual = await draft.blaze.provider.resolveUnspentOutputs(
    draft.inputs.map((utxo) => utxo.input()),
  );
  assertCurrent();
  if (
    actual.length !== draft.inputs.length ||
    draft.inputs.some(
      (expected) =>
        !actual.some(
          (utxo) =>
            utxo.input().toCbor() === expected.input().toCbor() &&
            utxo.output().toCbor() === expected.output().toCbor(),
        ),
    )
  )
    throw new Error(
      "WingRiders Rapid pool or reference changed. Build a new swap.",
    );
}
export async function submitRapidSwap(
  api: Cip30WalletApi,
  draft: PreparedRapidSwap,
  assertCurrent: () => void,
) {
  const current = async () => {
    await assertRapidMainnet();
    if ((await identity(api, assertCurrent)).address.toBytes() !== draft.owner)
      throw new Error("Wallet account changed. Review a new swap.");
    if ((await slot(assertCurrent)) >= draft.validUntil)
      throw new Error("WingRiders Rapid draft expired. Build a new swap.");
    await unchanged(draft, assertCurrent);
  };
  await current();
  if (
    draft.tx.body().toCbor() !== draft.body ||
    draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliary
  )
    throw new Error("The reviewed WingRiders Rapid draft changed.");
  await assertTransactionNetwork(draft.tx, assertCurrent, draft.blaze.provider);
  const signed = await draft.blaze.signTransaction(
    Core.Transaction.fromCbor(draft.tx.toCbor()),
  );
  await current();
  if (
    signed.body().toCbor() !== draft.body ||
    signed.auxiliaryData()?.toCbor() !== draft.auxiliary
  )
    throw new Error(
      "Wallet changed the reviewed WingRiders Rapid transaction.",
    );
  for (const key of draft.keys)
    assertSignedWithKey(
      signed,
      key,
      "Wallet did not sign every WingRiders Rapid funding key.",
    );
  await assertTransactionNetwork(signed, assertCurrent, draft.blaze.provider);
  return String(
    await draft.blaze.provider.postTransactionToChain(signed, assertCurrent),
  );
}
