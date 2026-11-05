import { Core } from "@blaze-cardano/sdk";
import { KERNEL_LANES, KERNEL_OBSERVERS, type KernelLane } from "./protocol";
import { decodeKernelDatum } from "./datum";

export type KernelAsset = { policyId: string; name: string };
export type Fraction = { numerator: bigint; denominator: bigint };
export type KernelCreation =
  | {
      kind: "limit-order";
      offer: KernelAsset;
      offerQuantity: bigint;
      ask: KernelAsset;
      price: Fraction;
      deposit: bigint;
    }
  | {
      kind: "loan-ask";
      principal: bigint;
      termDays: number;
      collateral: KernelAsset;
      deposit: bigint;
    }
  | {
      kind: "loan-offer";
      borrowerStakeHash: string;
      principal: bigint;
      termDays: number;
      interest: Fraction;
      collateral: KernelAsset;
      collateralRatio: Fraction;
      claimDays: number;
      deposit: bigint;
    }
  | {
      kind: "option-proposal";
      offer: KernelAsset;
      offerQuantity: bigint;
      ask: KernelAsset;
      premium: KernelAsset;
      premiumQuantity: bigint;
      strike: Fraction;
      expiresAt: number;
      deposit: bigint;
    }
  | { kind: "spot-sale"; nft: KernelAsset; price: bigint; deposit: bigint };
export const ADA: KernelAsset = { policyId: "", name: "" };
export function assetUnit(asset: KernelAsset) {
  if (
    (asset.policyId !== "" && !/^[a-f\d]{56}$/.test(asset.policyId)) ||
    !/^(?:[a-f\d]{2}){0,32}$/.test(asset.name) ||
    (!asset.policyId && asset.name)
  )
    throw new Error("Enter a valid policy ID and hexadecimal asset name.");
  return asset.policyId + asset.name;
}
export const pd = {
  map: (entries: [Core.PlutusData, Core.PlutusData][]) => {
    const map = new Core.PlutusMap();
    entries.forEach(([key, value]) => map.insert(key, value));
    return Core.PlutusData.newMap(map);
  },
  bytes: (value: string) => Core.PlutusData.newBytes(Core.fromHex(value)),
  int: (value: bigint) => Core.PlutusData.newInteger(value),
  list: (values: Core.PlutusData[]) => {
    const list = new Core.PlutusList();
    values.forEach((value) => list.add(value));
    return Core.PlutusData.newList(list);
  },
  con: (index: number, values: Core.PlutusData[] = []) => {
    const list = new Core.PlutusList();
    values.forEach((value) => list.add(value));
    return Core.PlutusData.newConstrPlutusData(
      new Core.ConstrPlutusData(BigInt(index), list),
    );
  },
};
function assetData(asset: KernelAsset) {
  assetUnit(asset);
  return pd.list([pd.bytes(asset.policyId), pd.bytes(asset.name)]);
}
function fraction(value: Fraction, allowZero = false) {
  if (
    value.denominator <= 0n ||
    value.numerator < 0n ||
    (!allowZero && !value.numerator)
  )
    throw new Error("Enter a positive fraction.");
  return pd.list([pd.int(value.numerator), pd.int(value.denominator)]);
}
function days(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 3650)
    throw new Error("Duration must be between 1 and 3650 days.");
  return pd.int(BigInt(value) * 86400000n);
}
function positive(value: bigint) {
  if (value <= 0n) throw new Error("Amounts must be positive.");
  return pd.int(value);
}
const utf8 = (value: string) => Core.toHex(new TextEncoder().encode(value));
const sha = (value: string) => String(Core.sha2_256(Core.HexBlob(value)));
function credential(hash: string) {
  if (!/^[a-f\d]{56}$/.test(hash))
    throw new Error("Enter a valid stake credential hash.");
  return pd.con(0, [pd.bytes(hash)]);
}
export function plutusAddress(address: Core.Address) {
  const { paymentPart, delegationPart } = address.getProps();
  if (address.getNetworkId() !== 0 || !paymentPart)
    throw new Error("Use a testnet payment address.");
  const cred = (part: typeof paymentPart) =>
    pd.con(part.type, [pd.bytes(part.hash)]);
  return pd.con(0, [
    cred(paymentPart),
    address.asPointer()
      ? pd.con(0, [
          pd.con(1, [
            pd.int(address.asPointer()!.getStakePointer().slot),
            pd.int(BigInt(address.asPointer()!.getStakePointer().txIndex)),
            pd.int(BigInt(address.asPointer()!.getStakePointer().certIndex)),
          ]),
        ])
      : delegationPart
        ? pd.con(0, [pd.con(0, [cred(delegationPart)])])
        : pd.con(1),
  ]);
}
export type KernelPlan = {
  lane: KernelLane;
  address: Core.Address;
  value: Core.Value;
  datum: Core.PlutusData;
  mint: Map<Core.AssetName, bigint>;
  redeemer: Core.PlutusData;
  requiredKey: string;
  expiration?: number;
  description: string;
};
export function createKernelPlan(
  action: KernelCreation,
  payment: Core.Address,
  stakeHash: string,
): KernelPlan {
  credential(stakeHash);
  if (action.deposit < 2000000n)
    throw new Error(
      "Reserve at least 2 ADA for the contract output; final minimum ADA is checked during build.",
    );
  let lane: KernelLane,
    datum: Core.PlutusData,
    mintNames: string[],
    redeemer = pd.con(0),
    coin = action.deposit,
    owner = stakeHash,
    description: string;
  const assets = new Map<Core.AssetId, bigint>();
  const add = (asset: KernelAsset, quantity: bigint) => {
    const unit = assetUnit(asset);
    if (unit)
      assets.set(
        Core.AssetId(unit),
        (assets.get(Core.AssetId(unit)) ?? 0n) + quantity,
      );
    else coin += quantity;
  };
  const loanPolicy = KERNEL_LANES["loan-negotiation"].beaconPolicy,
    activeLoan = KERNEL_LANES["loan-active"].beaconPolicy;
  if (action.kind === "loan-ask" || action.kind === "loan-offer") {
    lane = "loan-negotiation";
    if (!assetUnit(action.collateral))
      throw new Error("Select a native asset for collateral.");
    const assetBeacon = sha(utf8("Asset")),
      principal = positive(action.principal),
      term = days(action.termDays);
    if (action.kind === "loan-ask") {
      datum = pd.con(0, [
        pd.bytes(loanPolicy),
        pd.bytes(activeLoan),
        pd.bytes(stakeHash),
        assetData(ADA),
        pd.bytes(assetBeacon),
        principal,
        term,
        pd.map([
          [
            pd.bytes(action.collateral.policyId),
            pd.bytes(action.collateral.name),
          ],
        ]),
      ]);
      mintNames = [utf8("Ask"), assetBeacon];
      redeemer = pd.con(0, [credential(stakeHash)]);
      add(action.collateral, 1n);
      description = "Create an ADA loan request";
    } else {
      credential(action.borrowerStakeHash);
      owner = action.borrowerStakeHash;
      const lenderId = "00" + stakeHash;
      datum = pd.con(1, [
        pd.bytes(loanPolicy),
        pd.bytes(activeLoan),
        pd.bytes(lenderId),
        plutusAddress(payment),
        assetData(ADA),
        pd.bytes(assetBeacon),
        principal,
        pd.con(1),
        term,
        fraction(action.interest, true),
        pd.con(0),
        pd.int(0n),
        pd.con(0),
        pd.map([
          [assetData(action.collateral), fraction(action.collateralRatio)],
        ]),
        pd.con(0),
        days(action.claimDays),
        pd.int(action.deposit),
        pd.con(1),
      ]);
      mintNames = [utf8("Offer"), assetBeacon, lenderId];
      redeemer = pd.con(1, [credential(stakeHash)]);
      add(ADA, action.principal);
      description = "Create an ADA loan offer";
    }
  } else if (action.kind === "option-proposal") {
    lane = "option-proposals";
    if (assetUnit(action.offer) === assetUnit(action.ask))
      throw new Error("Offer and exercise assets must differ.");
    const offerBeacon = sha("01" + assetUnit(action.offer)),
      askBeacon = sha("02" + assetUnit(action.ask)),
      premiumBeacon = sha("03" + assetUnit(action.premium));
    const pair = sha(
      (action.offer.policyId ? assetUnit(action.offer) : "00") +
        (action.ask.policyId ? assetUnit(action.ask) : "00"),
    );
    if (!Number.isSafeInteger(action.expiresAt) || action.expiresAt <= 0)
      throw new Error("Enter an expiration time.");
    datum = pd.con(0, [
      pd.bytes(KERNEL_LANES[lane].beaconPolicy),
      pd.bytes(KERNEL_LANES["option-active"].beaconPolicy),
      assetData(action.offer),
      positive(action.offerQuantity),
      assetData(action.ask),
      pd.bytes(pair),
      pd.bytes(offerBeacon),
      pd.bytes(askBeacon),
      assetData(action.premium),
      pd.bytes(premiumBeacon),
      pd.int(action.deposit),
      plutusAddress(payment),
      pd.list([
        pd.con(0, [
          positive(action.premiumQuantity),
          fraction(action.strike),
          pd.int(BigInt(action.expiresAt)),
        ]),
      ]),
    ]);
    mintNames = [offerBeacon, askBeacon, premiumBeacon, pair];
    add(action.offer, action.offerQuantity);
    description = "Write an options proposal";
  } else if (action.kind === "limit-order") {
    lane = "one-way";
    if (assetUnit(action.offer) === assetUnit(action.ask))
      throw new Error("Offer and ask assets must differ.");
    const offerBeacon = sha("01" + assetUnit(action.offer)),
      askBeacon = sha("02" + assetUnit(action.ask)),
      pair = sha(
        (action.offer.policyId ? assetUnit(action.offer) : "00") +
          (action.ask.policyId ? assetUnit(action.ask) : "00"),
      );
    if (action.price.numerator <= 0n || action.price.denominator <= 0n)
      throw new Error("Price must be positive.");
    datum = pd.con(0, [
      pd.bytes(KERNEL_LANES[lane].beaconPolicy),
      pd.bytes(pair),
      pd.bytes(action.offer.policyId),
      pd.bytes(action.offer.name),
      pd.bytes(offerBeacon),
      pd.bytes(action.ask.policyId),
      pd.bytes(action.ask.name),
      pd.bytes(askBeacon),
      pd.con(0, [
        pd.int(action.price.numerator),
        pd.int(action.price.denominator),
      ]),
      pd.con(1),
    ]);
    mintNames = [pair, offerBeacon, askBeacon];
    positive(action.offerQuantity);
    add(action.offer, action.offerQuantity);
    description = "Create a one-way limit order";
  } else {
    lane = "aftermarket";
    if (!assetUnit(action.nft)) throw new Error("Choose a native NFT.");
    const observer = KERNEL_OBSERVERS.aftermarket.hash;
    datum = pd.con(0, [
      pd.bytes(KERNEL_LANES[lane].beaconPolicy),
      pd.bytes(observer),
      pd.bytes(action.nft.policyId),
      pd.list([pd.bytes(action.nft.name)]),
      plutusAddress(payment),
      pd.int(action.deposit),
      pd.map([[assetData(ADA), positive(action.price)]]),
    ]);
    mintNames = [utf8("Spot"), sha("00" + action.nft.policyId)];
    add(action.nft, 1n);
    description = "List an NFT for an ADA spot sale";
  }
  const protocol = KERNEL_LANES[lane],
    mint = new Map<Core.AssetName, bigint>();
  for (const name of mintNames)
    mint.set(Core.AssetName(name), (mint.get(Core.AssetName(name)) ?? 0n) + 1n);
  for (const [name, quantity] of mint)
    assets.set(Core.AssetId(protocol.beaconPolicy + name), quantity);
  decodeKernelDatum(protocol.family, datum.toCbor());
  return {
    lane,
    address: Core.addressFromCredentials(
      0,
      Core.Credential.fromCore({
        type: Core.CredentialType.ScriptHash,
        hash: Core.Hash28ByteBase16(protocol.validatorHash),
      }),
      Core.Credential.fromCore({
        type: Core.CredentialType.KeyHash,
        hash: Core.Hash28ByteBase16(owner),
      }),
    ),
    value: new Core.Value(coin, assets),
    datum,
    mint,
    redeemer,
    requiredKey: stakeHash,
    expiration:
      action.kind === "option-proposal" ? action.expiresAt : undefined,
    description,
  };
}
