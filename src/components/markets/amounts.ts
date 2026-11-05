import { assetName } from "../../lib/tools/transactions";
import { formatAda } from "../../lib/format";

export function marketAssetName(unit: string): string {
  return unit === "lovelace" || unit === "" ? "ADA" : assetName(unit);
}

export function marketAmount(quantity: bigint, unit: string): string {
  return unit === "lovelace" || unit === ""
    ? formatAda(quantity)
    : `${quantity.toLocaleString()} ${marketAssetName(unit)}`;
}

function outputQuantity(value: bigint): bigint {
  if (value > 18446744073709551615n)
    throw new Error(
      "Amount exceeds the unsigned 64-bit transaction output limit.",
    );
  return value;
}

export function rawAmount(input: string, unit: string): bigint {
  const text = input.trim();
  if (unit !== "lovelace" && unit !== "") {
    if (!/^\d{1,24}$/.test(text))
      throw new Error("Enter a whole number of token base units.");
    return outputQuantity(BigInt(text));
  }
  if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(text))
    throw new Error("Enter ADA with at most six decimal places.");
  const [whole, fraction = ""] = text.split(".");
  return outputQuantity(
    BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0")),
  );
}

export function decimalFraction(
  input: string,
  numeratorScale = 1n,
  denominatorScale = 1n,
) {
  if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(input.trim()))
    throw new Error(
      "Enter a nonnegative number with at most eight decimal places.",
    );
  const [whole, tail = ""] = input.trim().split(".");
  let numerator = BigInt(whole + tail) * numeratorScale,
    denominator = 10n ** BigInt(tail.length) * denominatorScale;
  if (numeratorScale <= 0n || denominatorScale <= 0n)
    throw new Error("Invalid asset scale.");
  let a = numerator,
    b = denominator;
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  numerator /= a;
  denominator /= a;
  return { numerator, denominator };
}
