import { calculateMinAda } from "@blaze-cardano/sdk";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import {
  kernelLifecyclePlan,
  type KernelLifecycle,
} from "../../lib/kernel/lifecycle";

const kinds = [
  "option-purchase",
  "option-exercise",
  "spot-purchase",
  "loan-accept",
  "loan-repay",
  "loan-accrue",
] as const;
type DepositKind = (typeof kinds)[number];
export type DepositAction = Extract<KernelLifecycle, { kind: DepositKind }>;
export function needsKernelDeposits(action: {
  kind: string;
}): action is DepositAction {
  return kinds.includes(action.kind as DepositKind);
}
export async function readKernelOutputParameters(signal?: AbortSignal) {
  const parameters = await blockfrostFetch<{
    coins_per_utxo_size: string | number;
  }>("/api/v0/epochs/latest/parameters", { signal });
  const value = Number(parameters.coins_per_utxo_size);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Dingo returned invalid output-size parameters.");
  return value;
}
export function kernelMinimumDeposits(
  action: DepositAction,
  coinsPerUtxoByte: number,
  stakeHash: string | undefined,
  startTime: number,
) {
  if (!Number.isSafeInteger(coinsPerUtxoByte) || coinsPerUtxoByte <= 0)
    throw new Error("Current output-size parameters are required.");
  const next = { ...action };
  const fields =
    action.kind === "option-purchase"
      ? ["paymentDeposit", "contractTopUp"]
      : action.kind === "loan-accept"
        ? ["collateralDeposit", "lenderTopUp"]
        : action.kind === "loan-accrue"
          ? ["depositTopUp"]
          : ["paymentDeposit"];
  const borrower =
    action.kind === "loan-accept"
      ? action.ask.fields.borrower_id
      : "record" in action
        ? action.record.fields.borrower_id
        : undefined;
  const previewStake =
    stakeHash || (typeof borrower === "string" ? borrower : undefined);
  const initial = kernelLifecyclePlan(action, previewStake, startTime);
  for (let attempt = 0; attempt < 8; attempt++) {
    const plan = kernelLifecyclePlan(next, previewStake, startTime);
    let changed = false;
    for (let index = 0; index < plan.outputs.length; index++) {
      const output = plan.outputs[index],
        minimum = calculateMinAda(output, coinsPerUtxoByte),
        coin = output.amount().coin();
      if (coin >= minimum) continue;
      const field = fields[index];
      if (field === "lenderTopUp")
        throw new Error(
          "The offer’s pinned lender deposit is below minimum ADA. Its lender must close and recreate the offer.",
        );
      if (!field || !(field in next))
        throw new Error(
          "This output does not allow an additional ADA deposit.",
        );
      const values = next as unknown as Record<string, bigint>;
      values[field] =
        field === "collateralDeposit"
          ? minimum
          : values[field] + minimum - coin;
      changed = true;
    }
    if (!changed)
      return {
        action: next,
        outputs: plan.outputs.map((output, index) => ({
          label:
            fields[index] === "paymentDeposit"
              ? "Payment"
              : fields[index] === "lenderTopUp"
                ? "Lender key"
                : fields[index] === "collateralDeposit"
                  ? "Collateral"
                  : "Continuing contract",
          extra:
            output.amount().coin() - initial.outputs[index].amount().coin(),
          coin: output.amount().coin(),
          assets: [...(output.amount().multiasset() ?? new Map())].map(
            ([unit, quantity]) => ({ unit: String(unit), quantity }),
          ),
        })),
      };
  }
  throw new Error(
    "Output minimum ADA did not stabilize. Refresh protocol parameters.",
  );
}
