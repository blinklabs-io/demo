import { Core } from "@blaze-cardano/sdk";
import { blake2b } from "blakejs";
import { pd, assetUnit } from "../kernel/actions";

export const SPLASH_ORDER_HASH = "464eeee89f05aff787d40045af2a40a83fd96c513197d32fbc54ff02";
export const SPLASH_REFERENCE = "b91eda29d145ab6c0bc0d6b7093cb24b131440b7b015033205476f39c690a51f";
export type SplashTerms = {
  input: string;
  output: string;
  amount: bigint;
  minimum: bigint;
  stepCost: bigint;
  steps: number;
  executorFee: bigint;
  extraAda: bigint;
};
export function splashFields(data: Core.PlutusData, alternative: bigint, count: number) {
  const con = data.asConstrPlutusData();
  if (!con || con.getAlternative() !== alternative || con.getData().getLength() !== count)
    throw new Error("Invalid Splash datum structure.");
  return Array.from({ length: count }, (_, index) => con.getData().get(index));
}
function bytes(data: Core.PlutusData, size?: number) {
  const value = data.asBoundedBytes();
  if (!value || value.length > 32 || (size !== undefined && value.length !== size)) throw new Error("Invalid Splash datum bytes.");
  return Core.toHex(value);
}
function integer(data: Core.PlutusData, positive = false) {
  const value = data.asInteger();
  if (value === undefined || value < (positive ? 1n : 0n) || value > 9223372036854775807n) throw new Error("Invalid Splash datum quantity.");
  return value;
}
export function splashAsset(unit: string) {
  if (unit === "lovelace") return [pd.bytes(""), pd.bytes("")];
  if (!assetUnit({ policyId: unit.slice(0, 56), name: unit.slice(56) })) throw new Error("Choose ADA or a native token.");
  return [pd.bytes(unit.slice(0, 56)), pd.bytes(unit.slice(56))];
}
function asset(data: Core.PlutusData) {
  const [policy, name] = splashFields(data, 0n, 2);
  return assetUnit({ policyId: bytes(policy), name: bytes(name) }) || "lovelace";
}
function credential(data: Core.PlutusData) {
  const con = data.asConstrPlutusData(), tag = con?.getAlternative();
  if (!con || (tag !== 0n && tag !== 1n)) throw new Error("Invalid Splash address credential.");
  const [hash] = splashFields(data, tag, 1);
  return Core.Credential.fromCore({ type: tag === 0n ? Core.CredentialType.KeyHash : Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(bytes(hash, 28)) });
}
export function splashAddress(data: Core.PlutusData) {
  const [payment, stake] = splashFields(data, 0n, 2);
  if (stake.asConstrPlutusData()?.getAlternative() === 1n) {
    splashFields(stake, 1n, 0);
    return Core.addressFromCredential(1, credential(payment));
  }
  const [reference] = splashFields(stake, 0n, 1);
  if (reference.asConstrPlutusData()?.getAlternative() === 1n) {
    const [slot, tx, cert] = splashFields(reference, 1n, 3).map((value) => integer(value));
    if (tx > 65535n || cert > 65535n) throw new Error("Invalid Splash stake pointer.");
    return Core.Cardano.PointerAddress.fromCredentials(1, credential(payment).toCore(), { slot, txIndex: Core.Cardano.TxIndex(Number(tx)), certIndex: Core.Cardano.CertIndex(Number(cert)) }).toAddress();
  }
  const [inline] = splashFields(reference, 0n, 1);
  return Core.addressFromCredentials(1, credential(payment), credential(inline));
}
export function splashAddressData(address: Core.Address) {
  const { paymentPart, delegationPart } = address.getProps();
  if (address.getNetworkId() !== 1 || !paymentPart) throw new Error("Use a mainnet payment address.");
  const cred = (part: typeof paymentPart) => pd.con(part.type, [pd.bytes(String(part.hash))]);
  const pointer = address.asPointer()?.getStakePointer();
  if (pointer) {
    if (pointer.txIndex > 65535 || pointer.certIndex > 65535) throw new Error("Invalid Splash stake pointer.");
    return pd.con(0, [cred(paymentPart), pd.con(0, [pd.con(1, [pd.int(pointer.slot), pd.int(BigInt(pointer.txIndex)), pd.int(BigInt(pointer.certIndex))])])]);
  }
  return pd.con(0, [cred(paymentPart), delegationPart ? pd.con(0, [pd.con(0, [cred(delegationPart)])]) : pd.con(1)]);
}
export function splashOrderAddress(owner?: Core.Address) {
  const payment = Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(SPLASH_ORDER_HASH) });
  const stake = owner?.getProps().delegationPart;
  return stake ? Core.addressFromCredentials(1, payment, Core.Credential.fromCore(stake)) : Core.addressFromCredential(1, payment);
}
export function splashPlan(terms: SplashTerms) {
  splashAsset(terms.input); splashAsset(terms.output);
  if (terms.input === terms.output) throw new Error("Choose different input and output assets.");
  if (!Number.isInteger(terms.steps) || terms.steps < 1 || terms.steps > 16) throw new Error("Choose between one and sixteen execution steps.");
  if (terms.amount <= 0n || terms.minimum <= 0n || terms.stepCost <= 0n || terms.executorFee <= 0n || terms.extraAda < 1500000n)
    throw new Error("Enter positive amounts and fees, and fund at least 1.5 additional ADA.");
  const budget = BigInt(terms.steps) * terms.stepCost;
  const coin = terms.extraAda + budget + terms.executorFee + (terms.input === "lovelace" ? terms.amount : 0n);
  if ([terms.amount, terms.minimum, terms.stepCost, terms.executorFee, terms.extraAda, budget, coin].some((value) => value > 9223372036854775807n)) throw new Error("Splash amount exceeds the ledger quantity limit.");
  let numerator = terms.minimum, denominator = terms.amount, a = numerator, b = denominator;
  while (b) { const next = a % b; a = b; b = next; }
  numerator /= a; denominator /= a;
  const marginal = (terms.minimum + BigInt(terms.steps) - 1n) / BigInt(terms.steps);
  return { budget, coin, numerator, denominator, marginal };
}
// The beacon commits to the SDK's definite-length datum encoding.
export function splashDatumCbor(data: Core.PlutusData): Core.HexBlob {
  const writer = new Core.CborWriter();
  const write = (value: Core.PlutusData) => {
    const con = value.asConstrPlutusData(), list = value.asList(), raw = value.asBoundedBytes(), number = value.asInteger();
    if (con) {
      if (con.getAlternative() > 6n) throw new Error("Unsupported Splash constructor tag.");
      writer.writeTag(Number(121n + con.getAlternative()));
      const fields = con.getData(); writer.writeStartArray(fields.getLength());
      for (let index = 0; index < fields.getLength(); index++) write(fields.get(index));
    } else if (list) {
      writer.writeStartArray(list.getLength());
      for (let index = 0; index < list.getLength(); index++) write(list.get(index));
    } else if (raw) writer.writeByteString(raw);
    else if (number !== undefined) writer.writeInt(number);
    else throw new Error("Unsupported Splash datum value.");
  };
  write(data);
  return Core.HexBlob.fromBytes(writer.encode());
}
export function splashBeacon(input: Core.TransactionInput, outputIndex: bigint, zeroDatum: Core.PlutusData) {
  const hash = (value: Uint8Array) => blake2b(value, undefined, 28);
  const integerBytes = (value: bigint) => { const data = new Uint8Array(8); new DataView(data.buffer).setBigUint64(0, value, false); return data; };
  return Core.toHex(hash(Uint8Array.from([
    ...Core.fromHex(String(input.transactionId())), ...integerBytes(input.index()), ...integerBytes(outputIndex), ...hash(Core.fromHex(splashDatumCbor(zeroDatum))),
  ])));
}
export function createSplashOrder(terms: SplashTerms, owner: Core.Address, seed: Core.TransactionInput) {
  const plan = splashPlan(terms), payment = owner.getProps().paymentPart;
  if (owner.getNetworkId() !== 1 || payment?.type !== Core.CredentialType.KeyHash) throw new Error("Use a mainnet wallet with a payment signing key.");
  const values = [pd.bytes("00"), pd.bytes("00".repeat(28)), pd.con(0, splashAsset(terms.input)), pd.int(terms.amount), pd.int(terms.stepCost), pd.int(plan.marginal), pd.con(0, splashAsset(terms.output)), pd.con(0, [pd.int(plan.numerator), pd.int(plan.denominator)]), pd.int(terms.executorFee), splashAddressData(owner), pd.bytes(String(payment.hash)), pd.list([])];
  const beacon = splashBeacon(seed, 0n, pd.con(0, values));
  values[1] = pd.bytes(beacon);
  const output = new Core.TransactionOutput(splashOrderAddress(owner), new Core.Value(plan.coin, terms.input === "lovelace" ? undefined : new Map([[Core.AssetId(terms.input), terms.amount]])));
  output.setDatum(Core.Datum.newInlineData(Core.PlutusData.fromCbor(splashDatumCbor(pd.con(0, values)))));
  return { output, beacon, ...plan };
}
export function decodeSplashOrder(utxo: Core.TransactionUnspentOutput) {
  const output = utxo.output(), address = output.address(), payment = address.getProps().paymentPart;
  if (address.getNetworkId() !== 1 || payment?.type !== Core.CredentialType.ScriptHash || payment.hash !== SPLASH_ORDER_HASH) throw new Error("Not a deployed Splash mainnet order.");
  const datum = output.datum()?.asInlineData();
  if (!datum) throw new Error("Splash order requires an inline datum.");
  const f = splashFields(datum, 0n, 12);
  if (bytes(f[0], 1) !== "00") throw new Error("Unsupported Splash order type.");
  const beacon = bytes(f[1], 28), input = asset(f[2]), outputAsset = asset(f[6]), amount = integer(f[3]), stepCost = integer(f[4], true), marginal = integer(f[5], true), fee = integer(f[8]);
  const [n, d] = splashFields(f[7], 0n, 2), numerator = integer(n, true), denominator = integer(d, true);
  const owner = splashAddress(f[9]), cancelKey = bytes(f[10], 28), executors = f[11].asList();
  if (!executors || executors.getLength() > 32) throw new Error("Invalid Splash executor list.");
  for (let index = 0; index < executors.getLength(); index++) bytes(executors.get(index), 28);
  const inventory = input === "lovelace" ? output.amount().coin() : output.amount().multiasset()?.get(Core.AssetId(input)) ?? 0n;
  if (input === outputAsset || inventory < amount) throw new Error("Invalid Splash order asset inventory.");
  return { utxo, datum, beacon, input, output: outputAsset, amount, stepCost, marginal, fee, numerator, denominator, owner, cancelKey };
}
export type SplashOrder = ReturnType<typeof decodeSplashOrder>;
export const splashPoint = (order: SplashOrder) => `${order.utxo.input().transactionId()}#${order.utxo.input().index()}`;
