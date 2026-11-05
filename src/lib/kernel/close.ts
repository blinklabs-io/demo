import { Core } from "@blaze-cardano/sdk";
import { pd } from "./actions";
import { kernelRecord, type KernelRecord } from "./markets";
import { positionBeacons } from "./beacons";
export function canCloseKernelRecord(
  record: KernelRecord,
  stakeHash: string,
): boolean {
  if (!/^[a-f\d]{56}$/.test(stakeHash)) return false;
  if (record.lane === "loan-negotiation")
    return record.kind === "AskDatum"
      ? record.fields.borrower_id === stakeHash
      : record.kind === "OfferDatum" &&
          record.fields.lender_id === "00" + stakeHash;
  if (record.lane === "loan-active" || record.lane === "option-active")
    return false;
  if (
    record.lane === "aftermarket" &&
    !["SpotDatum", "AuctionDatum"].includes(record.kind)
  )
    return false;
  const stake = record.utxo.output().address().getProps().delegationPart;
  return (
    stake?.type === Core.CredentialType.KeyHash && stake.hash === stakeHash
  );
}
export function closeKernelPlan(record: KernelRecord, stakeHash: string) {
  const verified = kernelRecord(record.lane, record.utxo);
  if (!canCloseKernelRecord(verified, stakeHash))
    throw new Error("This wallet does not own a closable Kernel position.");
  const mint = positionBeacons(verified, -1n);
  const credential = pd.con(0, [pd.bytes(stakeHash)]);
  return {
    mint,
    spendRedeemer: pd.con(
      record.lane === "loan-negotiation" && record.kind === "OfferDatum"
        ? 1
        : 0,
    ),
    mintRedeemer:
      record.lane === "loan-negotiation"
        ? pd.con(record.kind === "AskDatum" ? 0 : 1, [credential])
        : pd.con(0),
  };
}
