export function parseAssetAmount(
  value: string,
  decimals: number,
  label = "asset",
): bigint {
  const trimmed = value.trim();
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error(`Invalid decimal count for ${label}.`);
  }

  if (decimals === 0) {
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Enter a whole-number ${label} amount.`);
    }
    return BigInt(trimmed);
  }

  const pattern = new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`);
  if (!pattern.test(trimmed)) {
    const unit = decimals === 1 ? "decimal place" : "decimal places";
    throw new Error(`Enter a ${label} amount with up to ${decimals} ${unit}.`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"))
  );
}

export function parseAdaToLovelace(value: string): bigint {
  return parseAssetAmount(value, 6, "ADA");
}
