// A grouping-only formatter applied to the whole-ADA part as a bigint
// (Intl.NumberFormat accepts bigint directly, exactly - no float round-trip).
// The fractional part is derived from string digits of the remainder, so
// this stays exact even for amounts well above Number.MAX_SAFE_INTEGER
// lovelace (e.g. epoch active_stake, network supply figures).
const groupFormatter = new Intl.NumberFormat("en-US");

export function formatAda(lovelace: bigint | number): string {
  const value =
    typeof lovelace === "bigint" ? lovelace : BigInt(Math.trunc(lovelace));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const remainder = abs % 1_000_000n;

  let fraction = remainder.toString().padStart(6, "0").replace(/0+$/, "");
  if (fraction.length < 2) {
    fraction = fraction.padEnd(2, "0");
  }

  return `${negative ? "-" : ""}${groupFormatter.format(whole)}.${fraction} ADA`;
}

export function shortenHash(hash: string, visible = 8): string {
  if (hash.length <= visible * 2 + 3) {
    return hash;
  }
  return `${hash.slice(0, visible)}...${hash.slice(-visible)}`;
}
