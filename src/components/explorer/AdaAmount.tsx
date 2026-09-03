import { formatAda } from "../../lib/format";

export interface AmountEntry {
  unit: string;
  quantity: string;
}

// Renders a Blockfrost `amount` array: the "lovelace" unit as ADA, everything
// else as a raw policy-id+asset-name unit with its quantity.
export function AdaAmount({ amount }: { amount: AmountEntry[] }) {
  const lovelace = amount.find((entry) => entry.unit === "lovelace");
  const assets = amount.filter((entry) => entry.unit !== "lovelace");

  return (
    <span>
      <span className="font-medium text-slate-100">
        {lovelace ? formatAda(BigInt(lovelace.quantity)) : formatAda(0n)}
      </span>
      {assets.length > 0 && (
        <span className="ml-2 text-xs text-slate-500">
          + {assets.length} asset{assets.length === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}
