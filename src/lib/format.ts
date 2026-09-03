const adaFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatAda(lovelace: bigint | number): string {
  const value = typeof lovelace === "bigint" ? lovelace : BigInt(lovelace);
  const whole = value / 1_000_000n;
  const remainder = value % 1_000_000n;
  const fractional = Number(remainder) / 1_000_000;
  return `${adaFormatter.format(Number(whole) + fractional)} ADA`;
}

export function shortenHash(hash: string, visible = 8): string {
  if (hash.length <= visible * 2 + 3) {
    return hash;
  }
  return `${hash.slice(0, visible)}...${hash.slice(-visible)}`;
}
