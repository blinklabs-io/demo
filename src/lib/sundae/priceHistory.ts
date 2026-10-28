import { DatumBuilderV3, type IPoolData } from "@sundaeswap/core";
import { blockfrostFetch } from "../dingo/blockfrost";
import { SUNDAE_V3_PROTOCOL } from "./protocol";
import { unitFromAssetId } from "./assets";

export const PRICE_INTERVAL = 6 * 60 * 60 * 1000;
export interface MarketPoint {
  time: number;
  price: number;
}
interface PoolTransaction {
  tx_hash: string;
  block_time: number;
}
interface PoolOutput {
  amount: Array<{ unit: string; quantity: string }>;
}

export async function readWeeklyPoolPrices(
  pool: IPoolData,
  signal?: AbortSignal,
): Promise<MarketPoint[]> {
  const end = Math.floor(Date.now() / PRICE_INTERVAL) * PRICE_INTERVAL;
  const start = end - 7 * 24 * 60 * 60 * 1000;
  const policy = SUNDAE_V3_PROTOCOL.blueprint.validators.find(
    (v) => v.title === "pool.mint",
  )!.hash;
  const nft = policy + DatumBuilderV3.computePoolNftName(pool.ident);
  const transactions: PoolTransaction[] = [];
  for (let page = 1; ; page++) {
    const rows = await blockfrostFetch<PoolTransaction[]>(
      `/api/v0/assets/${nft}/transactions?count=100&order=desc&page=${page}`,
      { signal },
    );
    if (
      rows.some(
        (row) =>
          !Number.isSafeInteger(row.block_time) ||
          !/^[a-f0-9]{64}$/i.test(row.tx_hash),
      )
    )
      throw new Error("Dingo returned invalid pool history.");
    transactions.push(...rows);
    if (rows.length < 100 || rows.at(-1)!.block_time * 1000 <= start) break;
  }
  const ordered = [
    ...new Map(transactions.map((tx) => [tx.tx_hash, tx])).values(),
  ].sort((a, b) => b.block_time - a.block_time);
  const samples: Array<{ time: number; tx: PoolTransaction }> = [];
  for (let time = start; time <= end; time += PRICE_INTERVAL) {
    const tx = ordered.find((tx) => tx.block_time * 1000 <= time);
    if (tx) samples.push({ time, tx });
  }
  const prices = new Map<string, number>();
  const selected = [
    ...new Map(
      samples.map((sample) => [sample.tx.tx_hash, sample.tx]),
    ).values(),
  ];
  // Six-hour samples reuse unchanged pool outputs; only four reads run at once.
  for (let i = 0; i < selected.length; i += 4) {
    await Promise.all(
      selected.slice(i, i + 4).map(async (tx) => {
        const result = await blockfrostFetch<{
          hash: string;
          outputs: PoolOutput[];
        }>(`/api/v0/txs/${tx.tx_hash}/utxos`, { signal });
        if (result.hash !== tx.tx_hash)
          throw new Error("Dingo returned a different pool transaction.");
        const outputs = result.outputs.filter((output) =>
          output.amount.some((a) => a.unit === nft && a.quantity === "1"),
        );
        if (outputs.length !== 1)
          throw new Error(
            "Historical pool reserves are unavailable or ambiguous.",
          );
        const reserve = (asset: IPoolData["assetA"]) => {
          const unit =
            asset.assetId === "ada.lovelace"
              ? "lovelace"
              : unitFromAssetId(asset.assetId);
          const amount = outputs[0].amount.find(
            (a) => a.unit === unit,
          )?.quantity;
          if (!amount || !/^\d+$/.test(amount) || asset.decimals === undefined)
            throw new Error(
              "Historical pool asset quantities or decimals are unavailable.",
            );
          return Number(BigInt(amount)) / 10 ** asset.decimals;
        };
        const price = reserve(pool.assetB) / reserve(pool.assetA);
        if (!Number.isFinite(price) || price <= 0)
          throw new Error("Historical pool price is invalid.");
        prices.set(tx.tx_hash, price);
      }),
    );
  }
  return samples.map(({ time, tx }) => ({
    time,
    price: prices.get(tx.tx_hash)!,
  }));
}
