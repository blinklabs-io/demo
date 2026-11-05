import type { KernelValue } from "../../lib/kernel/datum";
import type { KernelRecord } from "../../lib/kernel/markets";

export function kernelInteger(value: KernelValue | undefined): bigint | null {
  return typeof value === "bigint" ? value : null;
}
export function kernelAsset(value: KernelValue | undefined): string | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    typeof value[1] !== "string"
  )
    return null;
  return value[0] + value[1] || "lovelace";
}
export function kernelRatio(
  value: KernelValue | undefined,
): { numerator: bigint; denominator: bigint } | null {
  if (!value || typeof value !== "object") return null;
  const pair = Array.isArray(value)
    ? value
    : "fields" in value
      ? [value.fields.numerator, value.fields.denominator]
      : [];
  return typeof pair[0] === "bigint" &&
    typeof pair[1] === "bigint" &&
    pair[1] > 0n
    ? { numerator: pair[0], denominator: pair[1] }
    : null;
}
export function kernelPrice(
  value: KernelValue | undefined,
): { unit: string; quantity: bigint }[] {
  return Array.isArray(value)
    ? value.flatMap((row) => {
        if (!Array.isArray(row) || row.length !== 2) return [];
        const unit = kernelAsset(row[0]),
          quantity = kernelInteger(row[1]);
        return unit !== null && quantity !== null ? [{ unit, quantity }] : [];
      })
    : [];
}
export function kernelTerms(record: KernelRecord) {
  const possible = record.fields.possible_terms;
  if (Array.isArray(possible))
    return possible.flatMap((term) =>
      term &&
      typeof term === "object" &&
      !Array.isArray(term) &&
      "fields" in term
        ? [term.fields]
        : [],
    );
  return [record.fields];
}
export function kernelSwapAssets(record: KernelRecord, side: 1 | 2 = 1) {
  const f = record.fields;
  const asset = (prefix: string) =>
    typeof f[`${prefix}_id`] === "string" &&
    typeof f[`${prefix}_name`] === "string"
      ? String(f[`${prefix}_id`]) + String(f[`${prefix}_name`]) || "lovelace"
      : null;
  if (record.lane === "one-way")
    return { offer: asset("offer"), ask: asset("ask") };
  return side === 1
    ? { offer: asset("asset1"), ask: asset("asset2") }
    : { offer: asset("asset2"), ask: asset("asset1") };
}
export function percentRatio(value: KernelValue | undefined): number | null {
  const fraction = kernelRatio(value);
  if (!fraction) return null;
  const valuePercent =
    Number((fraction.numerator * 10000n) / fraction.denominator) / 100;
  return Number.isFinite(valuePercent) ? valuePercent : null;
}
export function kernelExpiry(value: KernelValue | undefined): number | null {
  const integer = kernelInteger(value);
  if (integer === null || integer < 0n || integer > 8640000000000000n)
    return null;
  return Number(integer);
}
