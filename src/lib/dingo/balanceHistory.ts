import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import { DINGO_CONFIG } from "./config";
import { formatAda } from "../format";

interface BalanceResponse {
  block_identifier: { index: number; hash: string };
  balances: Array<{
    value: string;
    currency: { symbol: string; decimals: number };
  }>;
}

export async function readEpochBalanceHistory(
  address: string,
  signal?: AbortSignal,
) {
  const latest = await blockfrostFetch<{
    height: number;
    time: number;
    hash: string;
    epoch: number;
  }>("/api/v0/blocks/latest", { signal });
  const samples: Array<{
    height: number;
    time: number;
    hash: string;
    epoch: number;
  }> = [];
  const unavailableEpochs: number[] = [];
  for (
    let epoch = Math.max(0, latest.epoch - 6);
    epoch < latest.epoch;
    epoch++
  ) {
    try {
      const hashes = await blockfrostFetch<string[]>(
        `/api/v0/epochs/${epoch}/blocks?count=1&order=desc`,
        { signal },
      );
      if (!hashes.length) {
        unavailableEpochs.push(epoch);
        continue;
      }
      const block = await blockfrostFetch<{
        height: number;
        time: number;
        hash: string;
        epoch: number;
      }>(`/api/v0/blocks/${hashes[0]}`, { signal });
      if (block.hash !== hashes[0] || block.epoch !== epoch)
        throw new Error("Dingo returned a different epoch's closing block.");
      samples.push(block);
    } catch (error) {
      if (error instanceof BlockfrostError && error.status === 404) {
        unavailableEpochs.push(epoch);
        continue;
      }
      throw error;
    }
  }
  samples.push(latest);
  const points: Array<{
    time: number;
    value: number;
    label: string;
    displayValue: string;
  }> = [];
  for (const sample of samples) {
    const response = await fetch(`${DINGO_CONFIG.meshUrl}/account/balance`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network_identifier: { blockchain: "cardano", network: "preview" },
        account_identifier: { address: address },
        block_identifier: { index: sample.height, hash: sample.hash },
      }),
    });
    if (!response.ok)
      throw new Error(
        `Dingo could not load historical balance (${response.status}).`,
      );
    const result = (await response.json()) as BalanceResponse;
    if (
      result.block_identifier.index !== sample.height ||
      result.block_identifier.hash !== sample.hash
    )
      throw new Error("Dingo returned a different historical block.");
    const ada = result.balances.find(
      (balance) =>
        balance.currency.symbol === "ADA" && balance.currency.decimals === 6,
    );
    if (!ada)
      throw new Error("Dingo did not return an ADA historical balance.");
    points.push({
      time: sample.time * 1000,
      label: `Epoch ${sample.epoch}${sample.hash === latest.hash ? " · current" : " · close"}`,
      value: Number(BigInt(ada.value)) / 1_000_000,
      displayValue: formatAda(BigInt(ada.value)),
    });
  }
  return { points, unavailableEpochs };
}
