import { formatAda, shortenHash } from "../../lib/format";
import { Link } from "react-router";

export interface AmountEntry {
  unit: string;
  quantity: string;
}

function assetName(unit: string): string {
  const hex = unit.slice(56);
  if (hex.length % 2 !== 0 || !/^[a-f0-9]*$/i.test(hex))
    return shortenHash(unit, 6);
  try {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (value) =>
      parseInt(value, 16),
    );
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return name &&
      [...name].every((character) => {
        const code = character.codePointAt(0)!;
        return code >= 32 && code !== 127;
      })
      ? name
      : shortenHash(unit, 6);
  } catch {
    return shortenHash(unit, 6);
  }
}

export function AdaAmount({ amount }: { amount: AmountEntry[] }) {
  const lovelace = amount.find((entry) => entry.unit === "lovelace");
  const assets = amount.filter((entry) => entry.unit !== "lovelace");
  return (
    <span className="amount-bundle">
      <span className="ada-quantity">
        {lovelace ? formatAda(BigInt(lovelace.quantity)) : formatAda(0n)}
      </span>
      {assets.length > 0 && (
        <span className="asset-chips">
          {assets.map((asset) => (
            <Link
              key={asset.unit}
              to={`/explorer/asset/${asset.unit}`}
              title={`${asset.unit}: ${asset.quantity} raw units`}
              aria-label={`Asset ${asset.unit}: ${asset.quantity} raw units`}
            >
              <span>{assetName(asset.unit)}</span>
              <strong>{BigInt(asset.quantity).toLocaleString()}</strong>
            </Link>
          ))}
        </span>
      )}
    </span>
  );
}
