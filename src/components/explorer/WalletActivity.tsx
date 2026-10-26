import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { DINGO_CONFIG } from "../../lib/dingo/config";
import { formatAda } from "../../lib/format";
import { Panel } from "./Panel";
import { PoolIdentity } from "./PoolIdentity";
import { PriceChart } from "./PriceChart";
import { QueryState } from "./QueryState";
import { BarChart, Gauge, Metric } from "./Visuals";

interface PoolSummary {
  pool_id: string;
  owners: string[];
  live_stake: string;
  live_saturation: number;
  live_delegators: number;
  blocks_minted: number;
  blocks_epoch: number;
  margin_cost: number;
  fixed_cost: string;
  declared_pledge: string;
}
interface Reward {
  epoch: number;
  amount: string;
  pool_id: string;
  type: string;
}
interface Transaction {
  block_height: number;
  block_time: number;
}
interface BalanceResponse {
  block_identifier: { index: number; hash: string };
  balances: Array<{
    value: string;
    currency: { symbol: string; decimals: number };
  }>;
}

export function WalletActivity({
  stakeAddress,
  poolId,
  addresses,
  addressesComplete,
}: {
  stakeAddress?: string;
  poolId?: string | null;
  addresses: string[];
  addressesComplete: boolean;
}) {
  const [historyAddress, setHistoryAddress] = useState("");
  const [requestedAddress, setRequestedAddress] = useState<string | null>(null);
  const pool = useQuery({
    queryKey: ["dingo", "pool", poolId],
    queryFn: ({ signal }) =>
      blockfrostFetch<PoolSummary>(`/api/v0/pools/${poolId}`, { signal }),
    enabled: Boolean(poolId),
    staleTime: 300_000,
  });
  const rewards = useQuery({
    queryKey: ["dingo", "wallet", "recent-rewards", stakeAddress],
    queryFn: ({ signal }) =>
      blockfrostFetch<Reward[]>(
        `/api/v0/accounts/${stakeAddress}/rewards?count=100&order=desc`,
        { signal },
      ),
    enabled: Boolean(stakeAddress),
    staleTime: 300_000,
    retry: false,
  });
  const epochRewards = new Map<number, bigint>();
  for (const reward of rewards.data ?? [])
    epochRewards.set(
      reward.epoch,
      (epochRewards.get(reward.epoch) ?? 0n) + BigInt(reward.amount),
    );
  const rewardPoints = [...epochRewards].sort(([a], [b]) => a - b).slice(-12);
  const history = useQuery({
    queryKey: ["dingo", "wallet", "address-balance-history", requestedAddress],
    enabled: Boolean(requestedAddress),
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const transactions = await blockfrostFetch<Transaction[]>(
        `/api/v0/addresses/${requestedAddress}/transactions?count=12&order=desc`,
        { signal },
      );
      const latest = await blockfrostFetch<{
        height: number;
        time: number;
        hash: string;
      }>("/api/v0/blocks/latest", { signal });
      const samples = [
        ...new Map(
          [
            { block_height: latest.height, block_time: latest.time },
            ...transactions,
          ].map((row) => [row.block_height, row]),
        ).values(),
      ]
        .slice(0, 6)
        .reverse();
      const points: Array<{ time: number; value: number }> = [];
      for (const sample of samples) {
        const response = await fetch(
          `${DINGO_CONFIG.meshUrl}/account/balance`,
          {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              network_identifier: { blockchain: "cardano", network: "preview" },
              account_identifier: { address: requestedAddress },
              block_identifier: { index: sample.block_height },
            }),
          },
        );
        if (!response.ok)
          throw new Error(
            `Dingo could not load historical balance (${response.status}).`,
          );
        const result = (await response.json()) as BalanceResponse;
        if (result.block_identifier.index !== sample.block_height)
          throw new Error("Dingo returned a different historical block.");
        const ada = result.balances.find(
          (balance) =>
            balance.currency.symbol === "ADA" &&
            balance.currency.decimals === 6,
        );
        if (!ada) throw new Error("Dingo did not return an ADA historical balance.");
        points.push({
          time: sample.block_time * 1000,
          value: Number(BigInt(ada.value)) / 1_000_000,
        });
      }
      return points;
    },
  });
  return (
    <>
      {poolId && (
        <Panel title="Your staked pool">
          <PoolIdentity poolId={poolId} />
          <QueryState isLoading={pool.isLoading} error={pool.error}>
            {pool.data && (
              <div className="wallet-staked-pool">
                <Gauge
                  label="Pool saturation"
                  value={pool.data.live_saturation * 100}
                  detail="Share of saturation threshold"
                />
                <div className="metric-grid">
                  <Metric
                    label="Live stake"
                    value={formatAda(BigInt(pool.data.live_stake))}
                  />
                  <Metric
                    label="Delegators"
                    value={pool.data.live_delegators.toLocaleString()}
                  />
                  <Metric
                    label="Blocks this epoch"
                    value={pool.data.blocks_epoch}
                  />
                  <Metric
                    label="Lifetime blocks"
                    value={pool.data.blocks_minted}
                  />
                  <Metric
                    label="Margin"
                    value={`${(pool.data.margin_cost * 100).toFixed(2)}%`}
                  />
                  <Metric
                    label="Fixed epoch cost"
                    value={formatAda(BigInt(pool.data.fixed_cost))}
                  />
                  <Metric
                    label="Declared pledge"
                    value={formatAda(BigInt(pool.data.declared_pledge))}
                  />
                </div>
              </div>
            )}
          </QueryState>
        </Panel>
      )}
      {stakeAddress && (
        <Panel title="Rewards per epoch">
          <QueryState isLoading={rewards.isLoading} error={rewards.error}>
            {rewards.isSuccess &&
              (rewardPoints.length ? (
                <>
                  <BarChart
                    title="Reward ADA"
                    items={rewardPoints.map(([epoch, amount]) => ({
                      label: `Epoch ${epoch}`,
                      value: Number(amount) / 1_000_000,
                      href: `/explorer/epoch/${epoch}`,
                    }))}
                  />
                  <p className="mt-3 text-xs text-slate-500">
                    Latest 12 rewarded epochs in the 100 most recent reward
                    records. Rewards earned, including amounts already
                    withdrawn.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  No reward records returned for this stake account.
                </p>
              ))}
          </QueryState>
        </Panel>
      )}
      <Panel title="Balance over time">
        <p className="mb-3 text-sm text-slate-400">
          Inspect an address at up to six recent transaction blocks, including
          the current tip. Historical UTxO balances exclude unwithdrawn staking
          rewards.
        </p>
        <form
          className="wallet-history-controls"
          onSubmit={(event) => {
            event.preventDefault();
            setRequestedAddress(historyAddress || addresses[0]);
          }}
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
            Address
            <select
              aria-label="Balance history address"
              value={historyAddress || addresses[0] || ""}
              onChange={(event) => setHistoryAddress(event.target.value)}
              className="min-w-0 rounded border border-slate-700 p-2"
            >
              {addresses.map((address) => (
                <option key={address} value={address}>
                  {address.slice(0, 18)}…{address.slice(-10)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
            disabled={
              !addresses.length || !addressesComplete || history.isFetching
            }
          >
            Load address history
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Loaded on request; no historical balance scans run in the background.
          This chart covers the selected address.
        </p>
        {requestedAddress &&
          requestedAddress === (historyAddress || addresses[0]) && (
            <div className="mt-4">
              <QueryState isLoading={history.isLoading} error={history.error}>
                {history.data && (
                  <PriceChart
                    points={history.data}
                    label="Address ADA balance at sampled blocks"
                  />
                )}
              </QueryState>
              {history.isError && (
                <button
                  className="mt-2 text-xs text-teal-300"
                  type="button"
                  onClick={() => void history.refetch()}
                >
                  Retry address history
                </button>
              )}
            </div>
          )}
      </Panel>
    </>
  );
}
