import { Core } from "@blaze-cardano/sdk";
import { assetUnit, pd, type KernelAsset } from "./actions";
import { kernelRecord, type KernelRecord } from "./markets";
import { KERNEL_LANES } from "./protocol";

export function quoteKernelSwap(
  record: KernelRecord,
  take: bigint,
  side: 1 | 2 = 1,
  extraAda: bigint = 0n,
) {
  if (record.lane !== "one-way" && record.lane !== "two-way")
    throw new Error("Choose a Kernel swap output.");
  const verified = kernelRecord(record.lane, record.utxo),
    fields = verified.fields;
  const text = (key: string) => {
    const value = fields[key];
    if (typeof value !== "string") throw new Error("Invalid swap asset.");
    return value;
  };
  const asset = (prefix: string): KernelAsset => ({
    policyId: text(prefix + "_id"),
    name: text(prefix + "_name"),
  });
  const first = asset(record.lane === "one-way" ? "offer" : "asset1"),
    second = asset(record.lane === "one-way" ? "ask" : "asset2");
  if (
    assetUnit(first) === assetUnit(second) ||
    (record.lane === "one-way" && side !== 1)
  )
    throw new Error("Invalid swap direction.");
  const offer = side === 1 ? first : second,
    ask = side === 1 ? second : first;
  const rate =
    fields[record.lane === "one-way" ? "swap_price" : `asset${side}_price`];
  if (
    !rate ||
    typeof rate !== "object" ||
    Array.isArray(rate) ||
    !("fields" in rate)
  )
    throw new Error("Invalid swap price.");
  const numerator = rate.fields.numerator,
    denominator = rate.fields.denominator;
  if (
    typeof numerator !== "bigint" ||
    typeof denominator !== "bigint" ||
    numerator <= 0n ||
    denominator <= 0n ||
    take <= 0n
  )
    throw new Error("Swap amounts and price must be positive.");
  const policy = KERNEL_LANES[record.lane].beaconPolicy;
  const beaconNames = [
    text("pair_beacon"),
    text(record.lane === "one-way" ? "offer_beacon" : "asset1_beacon"),
    text(record.lane === "one-way" ? "ask_beacon" : "asset2_beacon"),
  ];
  const tokens =
    record.utxo.output().amount().multiasset() ??
    new Map<Core.AssetId, bigint>();
  if (
    new Set(beaconNames).size !== 3 ||
    beaconNames.some(
      (name) => tokens.get(Core.AssetId(policy + name)) !== 1n,
    ) ||
    [...tokens].filter(([unit]) => unit.startsWith(policy)).length !== 3
  )
    throw new Error("Swap beacon inventory is invalid.");
  if (extraAda < 0n) throw new Error("Additional ADA cannot be negative.");
  if (!assetUnit(offer) && extraAda !== 0n)
    throw new Error(
      "Reduce the ADA received instead of adding ADA to its continuing output.",
    );
  const paid =
    (take * numerator + denominator - 1n) / denominator +
    (!assetUnit(ask) ? extraAda : 0n);
  let coin = record.utxo.output().amount().coin();
  const assets = new Map(tokens);
  const adjust = (target: KernelAsset, amount: bigint) => {
    const unit = assetUnit(target);
    if (unit) {
      const remaining = (assets.get(Core.AssetId(unit)) ?? 0n) + amount;
      if (remaining < 0n)
        throw new Error("Swap quantity exceeds available liquidity.");
      if (remaining) assets.set(Core.AssetId(unit), remaining);
      else assets.delete(Core.AssetId(unit));
    } else coin += amount;
  };
  adjust(offer, -take);
  adjust(ask, paid);
  if (assetUnit(ask)) coin += extraAda;
  if (coin <= 0n)
    throw new Error("Keep enough ADA in the continuing swap output.");
  const original = Core.PlutusData.fromCbor(Core.HexBlob(record.datumCbor))
    .asConstrPlutusData()!
    .getData();
  const values = Array.from({ length: original.getLength() }, (_, index) =>
    original.get(index),
  );
  values[values.length - 1] = pd.con(0, [
    pd.con(0, [
      pd.con(0, [pd.bytes(String(record.utxo.input().transactionId()))]),
      pd.int(record.utxo.input().index()),
    ]),
  ]);
  return {
    offer,
    ask,
    take,
    paid,
    extraAda,
    numerator,
    denominator,
    address: record.utxo.output().address(),
    value: new Core.Value(coin, assets),
    datum: pd.con(0, values),
    redeemer: pd.con(record.lane === "one-way" ? 2 : side === 1 ? 2 : 3),
  };
}
