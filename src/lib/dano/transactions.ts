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
import { assertDanoMainnet, readDanoPool, readDanoConfig } from "./read";
import { DANO_REFERENCE, DANO_HASH, danoSwapOutput, danoRedeemer } from "./data";
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
  if (!Number.isSafeInteger(tip.slot) || tip.slot < 4492800 || tip.slot > Number.MAX_SAFE_INTEGER - 600)
    throw new Error("Dingo returned an invalid mainnet tip.");
  return tip.slot;
}
export async function prepareDanoSwap(
  api: Cip30WalletApi,
  args: { poolName: string; poolOutpoint: string; configOutpoint: string; aToB: boolean; amount: bigint; minimum: bigint },
  assertCurrent: () => void,
) {
  await assertDanoMainnet();
  const owner = await identity(api, assertCurrent),
    pool = await readDanoPool(args.poolOutpoint);
  if (pool.name !== args.poolName)
    throw new Error("The Dano pool identity differs from the reviewed pool.");
  assertCurrent();
  const config = await readDanoConfig(); assertCurrent();
  if (`${config.utxo.input().transactionId()}#${config.utxo.input().index()}` !== args.configOutpoint) throw new Error("Dano configuration changed. Refresh the quote and review its fees again.");
  const start = await slot(assertCurrent);
  const epoch = BigInt(208 + Math.floor((start - 4492800) / 432000));
  const { output, quote } = danoSwapOutput(pool, config, args.aToB, args.amount, epoch);
  if (args.minimum <= 0n || quote.received < args.minimum)
    throw new Error(
      "The Dano CLMM output changed below the reviewed amount. Refresh and review again.",
    );
  const { blaze } = await getBlaze(api);
  const referenceInput = new Core.TransactionInput(
    Core.TransactionId(DANO_REFERENCE.split("#")[0]),
    0n,
  );
  const references = await blaze.provider.resolveUnspentOutputs([
    referenceInput,
  ]);
  assertCurrent();
  if (
    references.length !== 1 ||
    references[0].input().toCbor() !== referenceInput.toCbor() ||
    references[0].output().address().getNetworkId() !== 1 ||
    references[0].output().scriptRef()?.hash() !== DANO_HASH
  )
    throw new Error(
      "Dingo did not verify the deployed Dano CLMM reference script.",
    );
  if (
    output.amount().coin() <
    calculateMinAda(output, blaze.params.coinsPerUtxoByte)
  )
    throw new Error(
      "The continuing pool would be below its minimum ADA. Reduce the swap.",
    );
  const epochEnd = 4492800 + Number(epoch - 207n) * 432000;
  const validUntil = Math.min(start + 240, epochEnd - 1);
  if (validUntil <= start) throw new Error("The epoch is ending. Refresh after the boundary and review a new swap.");
  const refs = [references[0], config.utxo].sort((a,b) => String(a.input().transactionId()).localeCompare(String(b.input().transactionId())) || Number(a.input().index() - b.input().index()));
  const configIndex = refs.findIndex(u => u.input().toCbor() === config.utxo.input().toCbor());
  const delta = args.aToB ? args.amount : -args.amount;
  const redeemer = (first?: number) => (context: { sortedSpendInputs: Core.TransactionInput[] }) => {
    const index = context.sortedSpendInputs.findIndex(input => input.toCbor() === pool.utxo.input().toCbor());
    return danoRedeemer(first ?? index, index, delta);
  };
  const reward = Core.RewardAccount.fromCredential({ type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(DANO_HASH) }, 1);
  const builder = blaze.newTransaction().addInput(pool.utxo, redeemer()).addWithdrawal(reward, 0n, redeemer(configIndex)).addOutput(output).addRequiredSigner(Core.Ed25519KeyHashHex(owner.key)).setValidFrom(Core.Slot(start)).setValidUntil(Core.Slot(validUntil));
  for (const ref of refs) builder.addReferenceInput(ref);
  const tx = await builder.complete();
  assertCurrent();
  if (
    !tx.isValid() ||
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
      "The built Dano CLMM transaction differs from the reviewed swap.",
    );
  if (
    !tx
      .body()
      .requiredSigners()
      ?.toCore()
      .includes(Core.Ed25519KeyHashHex(owner.key))
  )
    throw new Error("Dano CLMM transaction omitted the wallet signer.");
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
  return {
    tx,
    blaze,
    quote,
    validUntil,
    owner: owner.address.toBytes(),
    keys: [...keys],
    inputs: [...new Map([...await assertTransactionNetwork(tx, assertCurrent, blaze.provider), pool.utxo, ...refs].map(u => [u.input().toCbor(), u])).values()],
    body: tx.body().toCbor(),
    auxiliary: tx.auxiliaryData()?.toCbor(),
  };
}
export type PreparedDanoSwap = Awaited<ReturnType<typeof prepareDanoSwap>>;
async function unchanged(draft: PreparedDanoSwap, assertCurrent: () => void) {
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
      "Dano CLMM pool or reference changed. Build a new swap.",
    );
}
export async function submitDanoSwap(
  api: Cip30WalletApi,
  draft: PreparedDanoSwap,
  assertCurrent: () => void,
) {
  const current = async () => {
    await assertDanoMainnet();
    if ((await identity(api, assertCurrent)).address.toBytes() !== draft.owner)
      throw new Error("Wallet account changed. Review a new swap.");
    if ((await slot(assertCurrent)) >= draft.validUntil)
      throw new Error("Dano CLMM draft expired. Build a new swap.");
    await unchanged(draft, assertCurrent);
  };
  await current();
  if (
    !draft.tx.isValid() ||
    draft.tx.body().toCbor() !== draft.body ||
    draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliary
  )
    throw new Error("The reviewed Dano CLMM draft changed.");
  await assertTransactionNetwork(draft.tx, assertCurrent, draft.blaze.provider);
  const signed = await draft.blaze.signTransaction(
    Core.Transaction.fromCbor(draft.tx.toCbor()),
  );
  await current();
  if (
    !signed.isValid() ||
    signed.body().toCbor() !== draft.body ||
    signed.auxiliaryData()?.toCbor() !== draft.auxiliary
  )
    throw new Error(
      "Wallet changed the reviewed Dano CLMM transaction.",
    );
  for (const key of draft.keys)
    assertSignedWithKey(
      signed,
      key,
      "Wallet did not sign every Dano CLMM funding key.",
    );
  await assertTransactionNetwork(signed, assertCurrent, draft.blaze.provider);
  return String(
    await draft.blaze.provider.postTransactionToChain(signed, assertCurrent),
  );
}
