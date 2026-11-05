import { Core } from "@blaze-cardano/sdk";
import type { KernelRecord } from "./markets";
import { KERNEL_LANES } from "./protocol";
const utf8 = (value: string) => Core.toHex(new TextEncoder().encode(value));
export function positionBeacons(record: KernelRecord, sign: 1n | -1n) {
  const text = (field: string) => {
    const value = record.fields[field];
    if (
      typeof value !== "string" ||
      value.length > 64 ||
      value.length % 2 ||
      !/^[a-f\d]+$/.test(value)
    )
      throw new Error("Invalid position beacon name.");
    return value;
  };
  let names: string[];
  switch (record.lane) {
    case "one-way":
      names = [text("pair_beacon"), text("offer_beacon"), text("ask_beacon")];
      break;
    case "two-way":
      names = [
        text("pair_beacon"),
        text("asset1_beacon"),
        text("asset2_beacon"),
      ];
      break;
    case "loan-negotiation":
      names =
        record.kind === "AskDatum"
          ? [utf8("Ask"), text("asset_beacon")]
          : record.kind === "OfferDatum"
            ? [utf8("Offer"), text("asset_beacon"), text("lender_id")]
            : [];
      break;
    case "loan-active":
      names = [
        utf8("Active"),
        text("asset_beacon"),
        text("loan_id"),
        text("borrower_id"),
      ];
      break;
    case "option-proposals":
      names = [
        text("trading_pair_beacon"),
        text("offer_asset_beacon"),
        text("ask_asset_beacon"),
        text("premium_asset_beacon"),
      ];
      break;
    case "option-active":
      names = [
        text("trading_pair_beacon"),
        text("offer_asset_beacon"),
        text("ask_asset_beacon"),
        text("contract_id"),
      ];
      break;
    case "aftermarket":
      if (!["SpotDatum", "AuctionDatum"].includes(record.kind))
        throw new Error("Position is not a seller listing.");
      names = [
        utf8(record.kind === "SpotDatum" ? "Spot" : "Auction"),
        String(Core.sha2_256(Core.HexBlob("00" + text("nft_policy_id")))),
      ];
      break;
  }
  if (!names.length) throw new Error("Missing position beacons.");
  const result = new Map<Core.AssetName, bigint>();
  for (const name of names)
    result.set(
      Core.AssetName(name),
      (result.get(Core.AssetName(name)) ?? 0n) + sign,
    );
  const policy = KERNEL_LANES[record.lane].beaconPolicy;
  for (const [name, quantity] of result)
    if (
      (record.utxo
        .output()
        .amount()
        .multiasset()
        ?.get(Core.AssetId(policy + name)) ?? 0n) <
      (quantity < 0n ? -quantity : quantity)
    )
      throw new Error("Position beacon inventory is incomplete.");
  return result;
}
