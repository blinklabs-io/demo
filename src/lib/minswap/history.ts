import { readDingoChainTime } from "../dingo/chainTime";
import { blockfrostFetch } from "../dingo/blockfrost";
import { authenticatePool, type MinswapPool, type MinswapUtxo } from "./data";
import { assertMinswapGenesis } from "./read";
import { Core } from "@blaze-cardano/sdk";
import {
  getDingoProvider,
  assertDingoNetwork,
} from "../dingo/utxorpc/provider";
import { minswapDeployment } from "./constants";
const INTERVAL = 6 * 60 * 60 * 1000;
const OUTPUT_BUDGET = 64;
export async function readMinswapHistory(
  pool: MinswapPool,
  signal?: AbortSignal,
) {
  await assertMinswapGenesis(signal);
  const provider = getDingoProvider();
  await assertDingoNetwork(provider);
  signal?.throwIfAborted();
  const chainTime = await readDingoChainTime(signal);
  const input = new Core.TransactionInput(
    Core.TransactionId(pool.txHash),
    BigInt(pool.outputIndex),
  );
  const resolved = await provider.resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (resolved.length !== 1 || resolved[0].input().toCbor() !== input.toCbor())
    throw new Error(
      "Pool state changed or was spent. Refresh the selected pool before reading history.",
    );
  const output = resolved[0].output();
  const current = authenticatePool({
    address: output.address().toBech32(),
    tx_hash: String(input.transactionId()),
    output_index: Number(input.index()),
    inline_datum: output.datum()?.asInlineData()?.toCbor() ?? null,
    amount: [
      { unit: "lovelace", quantity: output.amount().coin().toString() },
      ...[...(output.amount().multiasset() ?? new Map())].map(
        ([unit, quantity]) => ({
          unit: String(unit),
          quantity: quantity.toString(),
        }),
      ),
    ],
  });
  if (
    current.id !== pool.id ||
    current.txHash !== pool.txHash ||
    current.outputIndex !== pool.outputIndex ||
    current.datum !== pool.datum
  )
    throw new Error(
      "Pool state changed or was spent. Refresh the selected pool before reading history.",
    );
  pool = current;
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
  const end = Math.floor(chainTime / INTERVAL) * INTERVAL,
    start = end - 7 * 86400000;
  const currentPrice = Number(pool.reserveB) / Number(pool.reserveA);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0)
    throw new Error("Invalid current Minswap price.");
  const times = Array.from({ length: 29 }, (_, i) => start + i * INTERVAL);
  const byTime = new Map<number, { time: number; value: number }>();
  for (const time of times)
    if (creation.block_time * 1000 <= time)
      byTime.set(time, { time, value: currentPrice });
  if (byTime.size === 29)
    return { points: [...byTime.values()], partial: false };
  const needed = times.filter((time) => !byTime.has(time));
  const transactions: { tx_hash: string; block_time: number }[] = [];
  for (let page = 1; page <= 5; page++) {
    const rows = await blockfrostFetch<
      { tx_hash: string; block_time: number }[]
    >(
      `/api/v0/assets/${pool.lpAsset}/transactions?count=100&page=${page}&order=desc`,
      { signal },
    );
    if (
      rows.length > 100 ||
      rows.some(
        (row) =>
          !Number.isSafeInteger(row.block_time) ||
          row.block_time < 0 ||
          !/^[a-f\d]{64}$/.test(row.tx_hash),
      )
    )
      throw new Error("Dingo returned invalid Minswap history.");
    transactions.push(...rows);
    if (rows.length < 100) break;
  }
  const ordered = [
    ...new Map(transactions.map((row) => [row.tx_hash, row])).values(),
  ]
    .filter(
      (row) =>
        row.block_time * 1000 <= needed.at(-1)! && row.tx_hash !== pool.txHash,
    )
    .sort((a, b) => b.block_time - a.block_time);
  const prices = new Map<string, number | null | "unindexed">();
  function samplePrice(time: number) {
    for (const row of ordered) {
      if (row.block_time * 1000 > time) continue;
      if (!prices.has(row.tx_hash)) return undefined;
      const price = prices.get(row.tx_hash);
      // LP-free outputs can change without appearing in the LP asset history.
      if (price === "unindexed") return price;
      if (price !== null) return price;
    }
    return undefined;
  }
  for (
    let offset = 0;
    offset < Math.min(ordered.length, OUTPUT_BUDGET);
    offset += 4
  ) {
    await Promise.all(
      ordered
        .slice(offset, Math.min(offset + 4, OUTPUT_BUDGET))
        .map(async (row) => {
          const result = await blockfrostFetch<{
            hash: string;
            outputs: MinswapUtxo[];
          }>(`/api/v0/txs/${row.tx_hash}/utxos`, { signal });
          if (result.hash !== row.tx_hash)
            throw new Error("Dingo returned another pool transaction.");
          const states = result.outputs
            .filter(
              (output) =>
                Core.Address.fromString(output.address)?.getProps().paymentPart
                  ?.hash === minswapDeployment().poolScriptHash &&
                output.amount.some(
                  (asset) =>
                    asset.unit === minswapDeployment().poolAuthenAsset &&
                    asset.quantity === "1",
                ),
            )
            .map((output) => ({
              output,
              state: authenticatePool({ ...output, tx_hash: row.tx_hash }),
            }))
            .filter(({ state }) => state.id === pool.id);
          if (states.length > 1)
            throw new Error("Minswap history contains competing pool outputs.");
          if (!states.length) {
            prices.set(row.tx_hash, null);
            return;
          }
          const { state, output } = states[0];
          if (state.assetA !== pool.assetA || state.assetB !== pool.assetB)
            throw new Error(
              "Minswap history does not match the selected pool.",
            );
          const price = Number(state.reserveB) / Number(state.reserveA);
          if (!Number.isFinite(price) || price <= 0)
            throw new Error("Invalid Minswap historical price.");
          prices.set(
            row.tx_hash,
            output.amount.some(
              (asset) =>
                asset.unit === pool.lpAsset && BigInt(asset.quantity) > 0n,
            )
              ? price
              : "unindexed",
          );
        }),
    );
    signal?.throwIfAborted();
    if (needed.every((time) => samplePrice(time) !== undefined)) break;
  }
  for (const time of needed) {
    const price = samplePrice(time);
    if (typeof price === "number") byTime.set(time, { time, value: price });
  }
  return {
    points: [...byTime.values()].sort((a, b) => a.time - b.time),
    partial: byTime.size < 29,
  };
}
