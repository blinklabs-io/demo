import { Core } from "@blaze-cardano/sdk";
export const RAPID_POOL_HASH =
  "348225d4082c67eacf432a261f1b128a2411be18a2a4c3860974d473";
export const RAPID_MARKER = RAPID_POOL_HASH + "50";
export const RAPID_REFERENCE = {
  hash: "cbbe128223940a1c2e1ad83e5041b9d8ba4721bc11636ccc310c9d0154720e80",
  index: 0,
};
const MAX_SHARES = 9223372036854775807n;
export const RAPID_OIL = 2000000n;
export function fields(data: Core.PlutusData, count: number, alternative = 0n) {
  const constr = data.asConstrPlutusData(),
    items = constr?.getData();
  if (
    !constr ||
    constr.getAlternative() !== alternative ||
    items?.getLength() !== count
  )
    throw new Error("Invalid WingRiders Rapid datum constructor.");
  return Array.from({ length: count }, (_, index) => items.get(index));
}
export function constructor(alternative: bigint, values: Core.PlutusData[]) {
  const list = new Core.PlutusList();
  values.forEach((value) => list.add(value));
  return Core.PlutusData.newConstrPlutusData(
    new Core.ConstrPlutusData(alternative, list),
  );
}
function bytes(data: Core.PlutusData, length?: number) {
  const value = data.asBoundedBytes();
  if (
    !value ||
    value.length > 32 ||
    (length != null && value.length !== length)
  )
    throw new Error("Invalid WingRiders Rapid datum bytes.");
  return Core.toHex(value);
}
function integer(data: Core.PlutusData) {
  const value = data.asInteger();
  if (value == null || value < 0n || value > MAX_SHARES)
    throw new Error("Invalid WingRiders Rapid datum quantity.");
  return value;
}
function unit(policy: Core.PlutusData, name: Core.PlutusData) {
  const p = bytes(policy),
    n = bytes(name);
  if (!p && !n) return "lovelace";
  if (p.length !== 56)
    throw new Error("Invalid WingRiders Rapid asset policy.");
  return p + n;
}
export function quantity(output: Core.TransactionOutput, asset: string) {
  return asset === "lovelace"
    ? output.amount().coin()
    : (output.amount().multiasset()?.get(Core.AssetId(asset)) ?? 0n);
}
export function decodeRapidPool(utxo: Core.TransactionUnspentOutput) {
  const output = utxo.output(),
    address = output.address(),
    payment = address.getProps().paymentPart;
  if (
    address.getNetworkId() !== 1 ||
    payment?.type !== Core.CredentialType.ScriptHash ||
    payment.hash !== RAPID_POOL_HASH ||
    quantity(output, RAPID_MARKER) !== 1n
  )
    throw new Error("Not an authenticated mainnet WingRiders Rapid pool.");
  const datum = output.datum()?.asInlineData();
  if (!datum) throw new Error("WingRiders Rapid pool has no inline datum.");
  const values = fields(datum, 15),
    assetA = unit(values[0], values[1]),
    assetB = unit(values[2], values[3]);
  if (
    assetA === assetB ||
    assetB === "lovelace" ||
    assetA.startsWith(RAPID_POOL_HASH) ||
    assetB.startsWith(RAPID_POOL_HASH)
  )
    throw new Error("Invalid WingRiders Rapid underlying assets.");
  const treasuryA = integer(values[4]),
    treasuryB = integer(values[5]);
  const feeFrom = values[6].asConstrPlutusData()?.getAlternative();
  if (
    feeFrom == null ||
    feeFrom > 3n ||
    values[6].asConstrPlutusData()!.getData().getLength()
  )
    throw new Error("Invalid WingRiders Rapid fee asset.");
  unit(values[7], values[8]);
  const treasuryFees = [integer(values[9]), integer(values[10])],
    swapFees = [integer(values[11]), integer(values[12])],
    feeBasis = integer(values[13]);
  if (
    feeBasis <= 0n ||
    treasuryFees.some((fee, index) => fee + swapFees[index] >= feeBasis)
  )
    throw new Error("Invalid WingRiders Rapid fee ratio.");
  const name = bytes(values[14], 32),
    lpAsset = RAPID_POOL_HASH + name,
    heldShares = quantity(output, lpAsset),
    issuedShares = MAX_SHARES - heldShares;
  const reserveA =
      quantity(output, assetA) -
      treasuryA -
      (assetA === "lovelace" ? RAPID_OIL : 0n),
    reserveB = quantity(output, assetB) - treasuryB;
  if (
    heldShares < 0n ||
    issuedShares <= 0n ||
    heldShares >= MAX_SHARES ||
    reserveA <= 0n ||
    reserveB <= 0n ||
    output.amount().coin() < RAPID_OIL
  )
    throw new Error("WingRiders Rapid pool has invalid reserves or shares.");
  return {
    name,
    assetA,
    assetB,
    lpAsset,
    reserveA,
    reserveB,
    issuedShares,
    treasuryA,
    treasuryB,
    feeFrom,
    treasuryFees,
    swapFees,
    feeBasis,
    datum,
    utxo,
  };
}
export type RapidPool = ReturnType<typeof decodeRapidPool>;
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
export function quoteRapidSwap(pool: RapidPool, aToB: boolean, amount: bigint) {
  if (amount <= 0n || amount > MAX_SHARES)
    throw new Error(
      "Enter a positive WingRiders Rapid amount within the signed 64-bit limit.",
    );
  const x = aToB ? pool.reserveA : pool.reserveB,
    y = aToB ? pool.reserveB : pool.reserveA,
    index = aToB ? 0 : 1;
  const feeOnInput =
    pool.feeFrom === 0n ||
    (pool.feeFrom === 2n && aToB) ||
    (pool.feeFrom === 3n && !aToB);
  const gross = feeOnInput ? amount : y - ceil(x * y, x + amount);
  const swapFee = ceil(gross * pool.swapFees[index], pool.feeBasis),
    treasuryFee = ceil(gross * pool.treasuryFees[index], pool.feeBasis);
  const net = gross - swapFee - treasuryFee;
  if (net <= 0n)
    throw new Error(
      "Swap rounds to zero after fees. Increase the input amount.",
    );
  const received = feeOnInput ? y - ceil(x * y, x + net) : net;
  if (received <= 0n || received >= y)
    throw new Error("Swap output is outside the pool reserve.");
  const treasuryA = (feeOnInput ? aToB : !aToB) ? treasuryFee : 0n;
  const treasuryB = treasuryA ? 0n : treasuryFee;
  return {
    received,
    swapFee,
    treasuryA,
    treasuryB,
    deltaA: aToB ? amount : -received,
    deltaB: aToB ? -received : amount,
  };
}
export function rapidSwapOutput(
  pool: RapidPool,
  aToB: boolean,
  amount: bigint,
) {
  const quote = quoteRapidSwap(pool, aToB, amount),
    value = Core.Value.fromCbor(pool.utxo.output().amount().toCbor());
  const add = (asset: string, delta: bigint) => {
    if (asset === "lovelace") value.setCoin(value.coin() + delta);
    else {
      const assets = value.multiasset() ?? new Map();
      const next = (assets.get(Core.AssetId(asset)) ?? 0n) + delta;
      if (next) assets.set(Core.AssetId(asset), next);
      else assets.delete(Core.AssetId(asset));
      value.setMultiasset(assets);
    }
  };
  add(pool.assetA, quote.deltaA);
  add(pool.assetB, quote.deltaB);
  const values = fields(pool.datum, 15);
  values[4] = Core.PlutusData.newInteger(pool.treasuryA + quote.treasuryA);
  values[5] = Core.PlutusData.newInteger(pool.treasuryB + quote.treasuryB);
  const output = new Core.TransactionOutput(
    pool.utxo.output().address(),
    value,
  );
  output.setDatum(Core.Datum.newInlineData(constructor(0n, values)));
  return {
    output,
    quote,
    redeemer: constructor(0n, [
      constructor(aToB ? 1n : 0n, []),
      Core.PlutusData.newInteger(amount),
    ]),
  };
}
