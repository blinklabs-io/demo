export function ratio(value: bigint, total: bigint): number {
  return total > 0n ? Number((value * 10000n) / total) / 100 : 0;
}

export function compactAda(value: string | bigint): string {
  const ada = BigInt(value) / 1_000_000n;
  for (const [unit, divisor] of [
    ["B", 1_000_000_000n],
    ["M", 1_000_000n],
    ["K", 1_000n],
  ] as const) {
    if (ada >= divisor)
      return `${Number((ada * 100n) / divisor) / 100}${unit} ₳`;
  }
  return `${ada.toLocaleString()} ₳`;
}
