import { Core } from "@blaze-cardano/sdk";
import { blake2b } from "blakejs";
import { pd } from "../kernel/actions";

export const FLUID_CONFIG_POLICY = "235b32040fe1177c03b1d34febc470440c6eaaa2228a9c1b0e375200";
export const FLUID_CONFIG_ASSET = FLUID_CONFIG_POLICY + "706172616d6574657273";
export const FLUID_POOL_POLICY = "20f765d25da3a36644371f7619d97bdccf034f3067921921d9dce0f7";
export const FLUID_POOL_SPEND = "ecd0c0fc554beb43ade65d45dd471ede4d9cfc9b22bb70de8e113458";
export const FLUID_POOL_CANCEL = "f7ed285d6a9b9772666c7f379ac3e70d777b9d651026385fd26c3e4d";
export const FLUID_REFERENCES = [
  { hash: "b35ed92547f040c6733104a810d5611edf04fc2df6a9202f3fa78d38fe1bffc6", script: FLUID_POOL_POLICY },
  { hash: "d39ada3381d91682fd063b5f4a2351c2bddff8ec3259916b328a428394eb14ed", script: FLUID_POOL_SPEND },
  { hash: "d025e6bffb967f993d63ecb71c371eb31f1eabf24ef27def126be10364034501", script: FLUID_POOL_CANCEL },
];
export function fluidFields(data: Core.PlutusData, count: number, tag = 0n) {
  const con = data.asConstrPlutusData();
  if (!con || con.getAlternative() !== tag || con.getData().getLength() !== count) throw new Error("Unsupported FluidTokens datum structure.");
  return Array.from({ length: count }, (_, i) => con.getData().get(i));
}
function raw(data: Core.PlutusData, length?: number) {
  const bytes = data.asBoundedBytes();
  if (!bytes || (length !== undefined && bytes.length !== length)) throw new Error("Invalid FluidTokens datum bytes.");
  return Core.toHex(bytes);
}
function integer(data: Core.PlutusData) {
  const value = data.asInteger();
  if (value === undefined || value < 0n || value > 9223372036854775807n) throw new Error("Invalid FluidTokens quantity.");
  return value;
}
export function fluidAsset(unit: string) {
  if (unit === "lovelace") return pd.con(0, [pd.bytes(""), pd.bytes("")]);
  if (!/^[a-f0-9]{56}(?:[a-f0-9]{2}){0,32}$/.test(unit)) throw new Error("Choose ADA or a native token identifier.");
  return pd.con(0, [pd.bytes(unit.slice(0, 56)), pd.bytes(unit.slice(56))]);
}
function decodeAsset(data: Core.PlutusData) {
  const [policy, name] = fluidFields(data, 2), p = raw(policy), n = raw(name);
  const unit = p === "" && n === "" ? "lovelace" : p + n;
  fluidAsset(unit);
  if (unit !== "lovelace" && p.length !== 56) throw new Error("Invalid FluidTokens asset policy.");
  return unit;
}
export function fluidAddress(owner?: Core.Address) {
  const payment = Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(FLUID_POOL_SPEND) }), stake = owner?.getProps().delegationPart;
  return stake ? Core.addressFromCredentials(1, payment, Core.Credential.fromCore(stake)) : Core.addressFromCredential(1, payment);
}
export function decodeFluidConfig(utxo: Core.TransactionUnspentOutput) {
  const output = utxo.output(), payment = output.address().getProps().paymentPart;
  if (output.address().getNetworkId() !== 1 || payment?.type !== Core.CredentialType.ScriptHash || payment.hash !== FLUID_CONFIG_POLICY || output.amount().multiasset()?.get(Core.AssetId(FLUID_CONFIG_ASSET)) !== 1n) throw new Error("Not the authenticated FluidTokens V4 configuration.");
  const datum = output.datum()?.asInlineData();
  if (!datum) throw new Error("FluidTokens configuration has no inline datum.");
  const f = fluidFields(datum, 30);
  if (raw(f[2], 28) !== FLUID_POOL_POLICY || raw(f[8], 28) !== FLUID_POOL_SPEND || raw(f[22], 28) !== FLUID_POOL_CANCEL) throw new Error("FluidTokens pool deployment changed. This configuration is unsupported.");
  return { utxo };
}
export type FluidTerms = { principal: string; collateral: string; amount: bigint; collateralAmount: bigint; principalRatio: bigint; interest: bigint; hours: number; repaymentWindow: number; extraAda: bigint };
export function fluidPlan(terms: FluidTerms) {
  fluidAsset(terms.principal); fluidAsset(terms.collateral);
  if (terms.principal.startsWith(FLUID_POOL_POLICY)) throw new Error("Pool identifiers cannot be lent as principal.");
  if (terms.principal === terms.collateral) throw new Error("Choose different principal and collateral assets.");
  if ([terms.amount, terms.collateralAmount, terms.principalRatio, terms.interest].some(n => n <= 0n || n > 9223372036854775807n) || terms.interest > 10000n) throw new Error("Enter positive amounts and loan interest of at most 100%.");
  if (![terms.hours, terms.repaymentWindow].every(n => Number.isInteger(n) && n > 0 && n <= 8760)) throw new Error("Enter repayment periods between one and 8,760 hours.");
  if (terms.extraAda < 0n || (terms.principal === "lovelace" ? terms.extraAda !== 0n : terms.extraAda < 2000000n)) throw new Error("Native-token pools need at least 2 ADA funding; ADA pools use the deposited amount.");
  if ((terms.amount * (10000n + terms.interest) + 9999n) / 10000n > 9223372036854775807n) throw new Error("Loan repayment exceeds the ledger quantity limit.");
  const coin = terms.principal === "lovelace" ? terms.amount : terms.extraAda;
  if (coin > 9223372036854775807n) throw new Error("FluidTokens funding exceeds the ledger quantity limit.");
  return { coin };
}
function ownerData(address: Core.Address) {
  const { paymentPart, delegationPart } = address.getProps();
  if (address.getNetworkId() !== 1 || paymentPart?.type !== Core.CredentialType.KeyHash) throw new Error("Use a mainnet wallet payment key.");
  const cred = (part: typeof paymentPart) => pd.con(part.type, [pd.bytes(String(part.hash))]);
  const pointer = address.asPointer()?.getStakePointer();
  const stake = pointer ? pd.con(0, [pd.con(1, [pd.int(pointer.slot), pd.int(BigInt(pointer.txIndex)), pd.int(BigInt(pointer.certIndex))])]) : delegationPart ? pd.con(0, [pd.con(0, [cred(delegationPart)])]) : pd.con(1);
  return pd.con(0, [cred(paymentPart), stake]);
}
export function fluidRefData(input: Core.TransactionInput) { return pd.con(0, [pd.bytes(String(input.transactionId())), pd.int(input.index())]); }
export function createFluidPool(terms: FluidTerms, owner: Core.Address, seed: Core.TransactionInput) {
  const plan = fluidPlan(terms), none = pd.con(0, [pd.bytes("4e4f4e45"), pd.bytes("4e4f4e45")]);
  const lender = ownerData(owner), key = String(owner.getProps().paymentPart!.hash);
  const common = pd.con(0, [fluidAsset(terms.principal), none, pd.int(terms.interest), pd.int(BigInt(terms.hours)), pd.int(1n), pd.int(0n), pd.con(0), pd.con(1), pd.int(BigInt(terms.repaymentWindow)), pd.int(0n), pd.con(0), pd.bytes("")]);
  const collateral = pd.con(0, [pd.bytes(terms.collateral === "lovelace" ? "" : terms.collateral.slice(0, 56)), pd.con(0, [pd.bytes(terms.collateral === "lovelace" ? "" : terms.collateral.slice(56))]), none]);
  const datum = pd.con(0, [pd.bytes("4e4f4e45"), pd.con(0), common, pd.con(0, [pd.bytes(key)]), lender, pd.bytes(Core.toHex(blake2b(Core.fromHex(pd.con(0).toCbor()), undefined, 32))), pd.list([collateral]), pd.list([pd.int(terms.collateralAmount)]), pd.list([pd.int(terms.principalRatio)]), pd.con(0)]);
  const name = "00" + Core.toHex(blake2b(Core.fromHex(fluidRefData(seed).toCbor()), undefined, 28));
  const assets = new Map([[Core.AssetId(FLUID_POOL_POLICY + name), 1n]]);
  if (terms.principal !== "lovelace") assets.set(Core.AssetId(terms.principal), terms.amount);
  const output = new Core.TransactionOutput(fluidAddress(owner), new Core.Value(plan.coin, assets));
  output.setDatum(Core.Datum.newInlineData(datum));
  return { output, name };
}
export function decodeFluidPool(utxo: Core.TransactionUnspentOutput) {
  const output = utxo.output(), payment = output.address().getProps().paymentPart;
  if (output.address().getNetworkId() !== 1 || payment?.type !== Core.CredentialType.ScriptHash || payment.hash !== FLUID_POOL_SPEND) throw new Error("Not a FluidTokens V4 pool.");
  const datum = output.datum()?.asInlineData();
  if (!datum) throw new Error("FluidTokens pool has no inline datum.");
  const f = fluidFields(datum, 10), common = fluidFields(f[2], 12), authTag = f[3].asConstrPlutusData()?.getAlternative();
  if (authTag === undefined || authTag < 0n || authTag > 3n) throw new Error("Unsupported FluidTokens pool authorization.");
  const [owner] = fluidFields(f[3], 1, authTag);
  const dynamicTag = f[9].asConstrPlutusData()?.getAlternative();
  if (dynamicTag === undefined || (dynamicTag !== 0n && dynamicTag !== 1n)) throw new Error("Invalid FluidTokens collateral pricing flag.");
  fluidFields(f[9], 0, dynamicTag);
  const key = raw(owner, 28), principal = decodeAsset(common[0]);
  const markers = [...(output.amount().multiasset() ?? [])].filter(([unit, amount]) => unit.startsWith(FLUID_POOL_POLICY) && unit.length === 114 && amount === 1n);
  if (markers.length !== 1 || principal === markers[0][0]) throw new Error("FluidTokens pool identifier is missing or ambiguous.");
  const available = principal === "lovelace" ? output.amount().coin() : output.amount().multiasset()?.get(Core.AssetId(principal)) ?? 0n;
  return { utxo, key, authTag, name: String(markers[0][0]).slice(56), principal, available, interest: integer(common[2]), hours: integer(common[3]), window: integer(common[8]), dynamic: dynamicTag === 1n };
}
export type FluidPool = ReturnType<typeof decodeFluidPool>;
export const fluidPoint = (pool: { utxo: Core.TransactionUnspentOutput }) => `${pool.utxo.input().transactionId()}#${pool.utxo.input().index()}`;
