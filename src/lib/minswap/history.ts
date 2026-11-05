import { blockfrostFetch } from "../dingo/blockfrost";
import { authenticatePool, type MinswapPool, type MinswapUtxo } from "./data";
import { assertMinswapGenesis } from "./read";
const INTERVAL = 6 * 60 * 60 * 1000;
export async function readMinswapHistory(
  pool: MinswapPool,
  signal?: AbortSignal,
) {
  await assertMinswapGenesis(signal);
  const creation = await blockfrostFetch<{ hash: string; block_time: number }>(
    `/api/v0/txs/${pool.txHash}`,
    { signal },
  );
  if (
    creation.hash !== pool.txHash ||
    !Number.isSafeInteger(creation.block_time) ||
    creation.block_time < 0
  )
    throw new Error("Dingo returned invalid current-pool timing.");
  const end = Math.floor(Date.now() / INTERVAL) * INTERVAL,
    start = end - 7 * 86400000;
  const currentPrice = Number(pool.reserveB) / Number(pool.reserveA);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0)
    throw new Error("Invalid current Minswap price.");
  if (creation.block_time * 1000 <= start)
    return {
      points: Array.from({ length: 29 }, (_, index) => ({
        time: start + index * INTERVAL,
        value: currentPrice,
      })),
      partial: false,
    };
  const transactions: { tx_hash: string; block_time: number }[] = [];
  for (let page = 1; page <= 5; page++) {
    const rows = await blockfrostFetch<
      { tx_hash: string; block_time: number }[]
    >(
      `/api/v0/assets/${pool.lpAsset}/transactions?count=100&page=${page}&order=desc`,
      { signal },
    );
    if (
      rows.some(
        (row) =>
          !Number.isSafeInteger(row.block_time) ||
          row.block_time < 0 ||
          !/^[a-f\d]{64}$/.test(row.tx_hash),
      )
    )
      throw new Error("Dingo returned invalid Minswap history.");
    transactions.push(...rows);
    if (rows.length < 100 || rows.at(-1)!.block_time * 1000 <= start) {
      break;
    }
  }
  const ordered = [
    ...new Map(transactions.map((row) => [row.tx_hash, row])).values(),
  ].sort((a, b) => b.block_time - a.block_time);
  const samples = Array.from({ length: 29 }, (_, i) => start + i * INTERVAL)
    .map((time) => ({
      time,
      tx: ordered.find((row) => row.block_time * 1000 <= time),
    }))
    .filter(
      (
        row,
      ): row is { time: number; tx: { tx_hash: string; block_time: number } } =>
        !!row.tx,
    );
  const ids = [...new Set(samples.map((row) => row.tx.tx_hash))],
    prices = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 4)
    await Promise.all(
      ids.slice(i, i + 4).map(async (hash) => {
        const result = await blockfrostFetch<{
          hash: string;
          outputs: MinswapUtxo[];
        }>(`/api/v0/txs/${hash}/utxos`, { signal });
        if (result.hash !== hash)
          throw new Error("Dingo returned another pool transaction.");
        const matches = result.outputs.filter(
          (output) =>
            output.address === pool.address &&
            output.amount.some(
              (asset) =>
                asset.unit === pool.lpAsset && BigInt(asset.quantity) > 0n,
            ),
        );
        // LP transfers outside the pool do not establish a historical reserve state.
        if (!matches.length) return;
        if (matches.length !== 1)
          throw new Error("Minswap history contains competing pool outputs.");
        const state = authenticatePool({ ...matches[0], tx_hash: hash });
        if (
          state.id !== pool.id ||
          state.assetA !== pool.assetA ||
          state.assetB !== pool.assetB
        )
          throw new Error("Minswap history does not match the selected pool.");
        const price = Number(state.reserveB) / Number(state.reserveA);
        if (!Number.isFinite(price) || price <= 0)
          throw new Error("Invalid Minswap historical price.");
        prices.set(hash, price);
      }),
    );
  const historical = samples
    .filter((sample) => prices.has(sample.tx.tx_hash))
    .map((sample) => ({
      time: sample.time,
      value: prices.get(sample.tx.tx_hash)!,
    }));
  const byTime = new Map(historical.map((point) => [point.time, point]));
  // A currently unspent pool output proves these reserves persisted since its creation.
  for (let time = start; time <= end; time += INTERVAL)
    if (creation.block_time * 1000 <= time)
      byTime.set(time, { time, value: currentPrice });
  return {
    points: [...byTime.values()].sort((a, b) => a.time - b.time),
    partial: byTime.size < 29,
  };
}
