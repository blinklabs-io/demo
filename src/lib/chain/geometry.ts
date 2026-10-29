export interface WeightedTile {
  id: string;
  weight: bigint;
}
export type Tile<T> = T & {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function fraction(value: bigint, total: bigint) {
  return total > 0n ? Number((value * 1000000n) / total) / 1000000 : 0;
}
export function treemap<T extends WeightedTile>(
  items: T[],
  width = 1000,
  height = 500,
): Tile<T>[] {
  const result: Tile<T>[] = [];
  function split(rows: T[], x: number, y: number, w: number, h: number) {
    if (!rows.length) return;
    if (rows.length === 1) {
      result.push({ ...rows[0], x, y, width: w, height: h });
      return;
    }
    const total = rows.reduce((n, r) => n + r.weight, 0n);
    let count = 1,
      subtotal = rows[0].weight;
    while (count < rows.length - 1 && subtotal * 2n < total) {
      subtotal += rows[count].weight;
      count++;
    }
    const share = fraction(subtotal, total);
    if (w >= h) {
      split(rows.slice(0, count), x, y, w * share, h);
      split(rows.slice(count), x + w * share, y, w * (1 - share), h);
    } else {
      split(rows.slice(0, count), x, y, w, h * share);
      split(rows.slice(count), x, y + h * share, w, h * (1 - share));
    }
  }
  split(
    items.filter((r) => r.weight > 0n),
    0,
    0,
    width,
    height,
  );
  return result;
}
export const visualColors = [
  "#3fddbf",
  "#a99bff",
  "#ffc969",
  "#65b8f5",
  "#ee89c3",
  "#fb927f",
];
export function fingerprint(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
