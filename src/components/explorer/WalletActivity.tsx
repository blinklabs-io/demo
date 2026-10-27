import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { readEpochBalanceHistory } from "../../lib/dingo/balanceHistory";
import { formatAda } from "../../lib/format";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";
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

export function WalletActivity({
  stakeAddress,
  poolId,
  addresses,
}: {
  stakeAddress?: string;
  poolId?: string | null;
  addresses: string[];
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
    queryKey: ["dingo", "wallet", "epoch-balance-snapshots", requestedAddress],
    enabled: Boolean(requestedAddress),
    staleTime: 300_000,
    retry: false,
    queryFn: ({ signal }) => readEpochBalanceHistory(requestedAddress!, signal),
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
          Compare the last six completed epoch balances with the current
          balance. Each historical snapshot uses the epoch’s final block.
          Unwithdrawn staking rewards are excluded.
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
            disabled={!addresses.length || history.isFetching}
          >
            Load address history
          </button>
        </form>
        {addresses.length > 0 && (
          <div className="mt-3">
            <HashLink kind="address" id={historyAddress || addresses[0]} full />
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Loaded on request; no historical balance scans run in the background.
          This chart covers the selected address.
        </p>
        {requestedAddress &&
          requestedAddress === (historyAddress || addresses[0]) && (
            <div className="mt-4">
              <QueryState isLoading={history.isLoading} error={history.error}>
                {history.data && (
                  <>
                    <PriceChart
                      points={history.data.points}
                      label="Address ADA balance by epoch"
                      timeScale="date"
                    />
                    {history.data.unavailableEpochs.length > 0 && (
                      <p role="status" className="mt-3 text-xs text-amber-200">
                        Dingo has no historical block data for epochs{" "}
                        {history.data.unavailableEpochs.join(", ")}. Those
                        epochs are omitted; no balance is inferred.
                      </p>
                    )}
                  </>
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
