import { walletScriptIdentity } from "../dingo/ownedScriptOutputs";
import { Core, calculateMinAda } from "@blaze-cardano/sdk";
import { getBlaze } from "../dingo/blaze";
import type { Cip30WalletApi } from "../dingo/cip30";
import { blockfrostFetch } from "../dingo/blockfrost";
import { assertWalletSession, assertTransactionNetwork } from "../dingo/walletSession";
import { assertSignedWithKey } from "../dingo/signatureWitness";
import { pd } from "../kernel/actions";
import { FLUID_POOL_POLICY, FLUID_REFERENCES, createFluidPool, fluidRefData, fluidPlan, type FluidTerms } from "./data";
import { assertFluidMainnet, readFluidPool, readFluidConfig } from "./read";

export type FluidAction = { kind: "create"; terms: FluidTerms } | { kind: "cancel"; outpoint: string };
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
export async function prepareFluidAction(api: Cip30WalletApi, action: FluidAction, guard: () => void) {
  if (action.kind === "create") fluidPlan(action.terms);
  await assertFluidMainnet();
  const owner = await identity(api, guard), { blaze } = await getBlaze(api); guard();
  const config = await readFluidConfig(); guard();
  const pins = action.kind === "create" ? FLUID_REFERENCES.slice(0,1) : FLUID_REFERENCES;
  const inputs = pins.map(pin => new Core.TransactionInput(Core.TransactionId(pin.hash),0n));
  const references = await blaze.provider.resolveUnspentOutputs(inputs); guard();
  if (references.length !== pins.length || pins.some((pin,index) => !references.some(ref => ref.input().toCbor() === inputs[index].toCbor() && ref.output().address().getNetworkId() === 1 && ref.output().scriptRef()?.hash() === pin.script))) throw new Error("Dingo did not verify the deployed FluidTokens pool scripts.");
  const refs = [config.utxo,...references].sort((a,b) => String(a.input().transactionId()).localeCompare(String(b.input().transactionId())) || Number(a.input().index()-b.input().index()));
  const configIndex = refs.findIndex(ref => ref.input().toCbor() === config.utxo.input().toCbor());
  const builder = blaze.newTransaction(), contractInputs = [...refs];
  for (const ref of refs) builder.addReferenceInput(ref);
  let output: Core.TransactionOutput, signer = owner.key, name: string;
  const mintDelta = action.kind === "create" ? 1n : -1n;
  const mint = (seed: Core.TransactionInput) => builder.addMint(Core.PolicyId(FLUID_POOL_POLICY),new Map([[Core.AssetName(name),mintDelta]]),pd.con(0,[pd.int(BigInt(configIndex)),fluidRefData(seed)]));
  if (action.kind === "create") {
    const available = await blaze.wallet.getUnspentOutputs(); guard();
    if (!available.length) throw new Error("The wallet has no funding output for the FluidTokens pool beacon.");
    const seed = available[0];
    const plan = createFluidPool(action.terms, owner.address, seed.input());
    output = plan.output; name = plan.name;
    builder.addInput(seed); mint(seed.input());
  } else {
    const pool = await readFluidPool(action.outpoint); guard();
    const {keys} = await walletScriptIdentity(api,owner.address.toBech32()); guard();
    if (pool.authTag !== 0n) throw new Error("This pool requires script authorization for cancellation.");
    if (!keys.includes(pool.key)) throw new Error("This wallet does not own the FluidTokens pool cancellation key.");
    signer = pool.key; name = pool.name;
    const value = Core.Value.fromCbor(pool.utxo.output().amount().toCbor()), assets = new Map(value.multiasset());
    assets.delete(Core.AssetId(FLUID_POOL_POLICY + name)); value.setMultiasset(assets);
    output = new Core.TransactionOutput(owner.address, value);
    builder.addInput(pool.utxo,pd.con(0)); mint(pool.utxo.input());
    const reward = (hash: string) => Core.RewardAccount.fromCredential({type:Core.CredentialType.ScriptHash,hash:Core.Hash28ByteBase16(hash)},1);
    builder.addWithdrawal(reward(FLUID_POOL_POLICY),0n,pd.con(0,[pd.int(BigInt(configIndex)),pd.con(0)]));
    builder.addWithdrawal(reward(FLUID_REFERENCES[2].script),0n,pd.con(0,[pd.int(BigInt(configIndex)),pd.list([pd.con(0,[pd.bytes(name)])])]));
    contractInputs.push(pool.utxo);
  }
  const minimum = calculateMinAda(output, blaze.params.coinsPerUtxoByte);
  if (output.amount().coin() < minimum) throw new Error(`The Fluid output needs at least ${minimum} lovelace. Increase the deposited ADA funding.`);
  const validUntil = (await slot(guard)) + 600;
  const tx = await builder.addOutput(Core.TransactionOutput.fromCbor(output.toCbor())).addRequiredSigner(Core.Ed25519KeyHashHex(signer)).setValidUntil(Core.Slot(validUntil)).complete(); guard();
  if (!tx.isValid() || tx.body().outputs()[0]?.toCbor() !== output.toCbor() || tx.body().mint()?.size !== 1 || tx.body().mint()?.get(Core.AssetId(FLUID_POOL_POLICY + name)) !== mintDelta || tx.body().outputs().slice(1).some((change) => change.address().toBytes() !== owner.address.toBytes()) || (tx.body().collateralReturn() && tx.body().collateralReturn()!.address().toBytes() !== owner.address.toBytes()))
    throw new Error("The built FluidTokens transaction differs from the reviewed outputs.");
  const funding = await assertTransactionNetwork(tx, guard, blaze.provider);
  const keys = [...new Set([signer, ...funding.flatMap((utxo) => { const key = utxo.output().address().getProps().paymentPart; return key?.type === Core.CredentialType.KeyHash ? [String(key.hash)] : []; })])];
  const snapshot = [...new Map([...funding, ...contractInputs].map((utxo) => [utxo.input().toCbor(), utxo.toCbor()])).values()];
  return { tx, blaze, output, name, validUntil, owner: owner.address.toBytes(), keys, snapshot, body: tx.body().toCbor(), auxiliary: tx.auxiliaryData()?.toCbor() };
}
export type FluidDraft = Awaited<ReturnType<typeof prepareFluidAction>>;
export async function submitFluidAction(api: Cip30WalletApi, draft: FluidDraft, guard: () => void) {
  const current = async () => {
    await assertFluidMainnet();
    if ((await identity(api, guard)).address.toBytes() !== draft.owner) throw new Error("Wallet account changed. Build a new FluidTokens transaction.");
    if ((await slot(guard)) >= draft.validUntil) throw new Error("FluidTokens draft expired. Build a new transaction.");
    const original = draft.snapshot.map((cbor) => Core.TransactionUnspentOutput.fromCbor(cbor));
    const actual = await draft.blaze.provider.resolveUnspentOutputs(original.map((utxo) => utxo.input())); guard();
    if (actual.length !== original.length || original.some((expected) => !actual.some((utxo) => utxo.toCbor() === expected.toCbor()))) throw new Error("FluidTokens funding, pool, or reference inputs changed or were spent.");
  };
  await current();
  if (!draft.tx.isValid() || draft.tx.body().toCbor() !== draft.body || draft.tx.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("The reviewed FluidTokens transaction changed.");
  const signed = await draft.blaze.signTransaction(Core.Transaction.fromCbor(draft.tx.toCbor()));
  await current();
  if (!signed.isValid() || signed.body().toCbor() !== draft.body || signed.auxiliaryData()?.toCbor() !== draft.auxiliary) throw new Error("Wallet changed the reviewed FluidTokens transaction.");
  for (const key of draft.keys) assertSignedWithKey(signed, key, "Wallet did not sign every FluidTokens funding key.");
  await assertTransactionNetwork(signed, guard, draft.blaze.provider);
  return String(await draft.blaze.provider.postTransactionToChain(signed, guard));
}
