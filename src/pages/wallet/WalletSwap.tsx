import { PageIntro } from "../../components/explorer/Visuals";
import { WalletConnectSummary } from "../../components/layout/WalletConnectSummary";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ADA_METADATA,
  SundaeUtils,
  DatumBuilderV3,
  type IPoolDataAsset,
} from "@sundaeswap/core";
import { useWalletStore } from "../../stores/walletStore";
import {
  assertDingoNetwork,
  getDingoProvider,
} from "../../lib/dingo/utxorpc/provider";
import { getBlaze } from "../../lib/dingo/blaze";
import { DingoSundaeQueryProvider } from "../../lib/sundae/dingoQueryProvider";
import {
  DEFAULT_POOL,
  POOL_PRESETS,
  SUNDAE_V3_PROTOCOL,
} from "../../lib/sundae/protocol";
import { AssetAmount } from "@sundaeswap/asset";
import { MarketChart } from "../../components/explorer/MarketChart";
import { readWeeklyPoolPrices } from "../../lib/sundae/priceHistory";
import { formatAssetAmount, unitFromAssetId } from "../../lib/sundae/assets";
import { parseAssetAmount } from "../../lib/dingo/amount";
import { buildSwapOrder, type SwapDirection } from "../../lib/sundae/swap";
import {
  offeredAssetForDirection,
  receivedAssetForDirection,
  priceImpactBasisPoints,
  formatBasisPointsPercent,
  spotPriceLabel,
  poolHasAda,
} from "../../lib/sundae/pricing";

function labelFor(asset: { assetId: string; ticker?: string }): string {
  if (asset.assetId === ADA_METADATA.assetId) {
    return "ADA";
  }
  return (
    asset.ticker ?? `${asset.assetId.slice(0, 8)}...${asset.assetId.slice(-6)}`
  );
}

function hasKnownDecimals(
  asset: IPoolDataAsset,
): asset is IPoolDataAsset & { decimals: number } {
  return (
    asset.decimals !== undefined &&
    Number.isInteger(asset.decimals) &&
    asset.decimals >= 0
  );
}

interface SwapResult {
  txHash: string;
  connectionId: number;
}

function createQueryProvider(): DingoSundaeQueryProvider {
  const provider = new DingoSundaeQueryProvider(getDingoProvider());
  for (const preset of POOL_PRESETS) {
    provider.setAssetHint(preset.assetBAssetId, {
      label: preset.assetBLabel,
      decimals: preset.assetBDecimals,
    });
  }
  return provider;
}

export default function WalletSwap() {
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const connectionId = useWalletStore((state) => state.connectionId);
  const balanceLovelace = useWalletStore((state) => state.balanceLovelace);
  const tokens = useWalletStore((state) => state.tokens);
  const refreshBalance = useWalletStore((state) => state.refreshBalance);

  const connected = status === "connected" && Boolean(walletApi);
  const queryProvider = useMemo(() => createQueryProvider(), []);

  // This app's Sundae V3 integration is hardcoded to Preview (script hashes,
  // reference UTxOs). Verify the configured Dingo endpoint actually serves
  // Preview, and that it has indexed the reference UTxOs the swap datum
  // builder needs, before letting anyone build an order against it - a
  // silently wrong network or a partially-synced node otherwise produces a
  // transaction that fails deep inside the SDK with no useful diagnostic.
  const networkCheck = useQuery({
    queryKey: ["dingo", "assert-network"],
    queryFn: () => assertDingoNetwork(getDingoProvider()),
    retry: false,
  });
  const referencesCheck = useQuery({
    queryKey: ["sundae", "validate-references"],
    queryFn: () => queryProvider.validateProtocolReferences(),
    enabled: connected && networkCheck.isSuccess,
    retry: false,
  });

  const [direction, setDirection] = useState<SwapDirection>("adaToToken");
  const [selectedIdent, setSelectedIdent] = useState(DEFAULT_POOL.ident);
  const [amount, setAmount] = useState("5");
  const [slippagePercent, setSlippagePercent] = useState("1");

  // Try to discover live ADA-paired Sundae V3 pools through Dingo; fall back
  // to the curated preset list (see dingo-sundae-preview's README) if Dingo
  // has none, or isn't reachable yet.
  const discoveredQuery = useQuery({
    queryKey: ["sundae", "discover-pools"],
    queryFn: () => queryProvider.discoverPools(),
    staleTime: 300_000,
    retry: false,
    enabled: networkCheck.isSuccess,
  });

  const discoveredAdaPools = (discoveredQuery.data ?? []).filter(
    (candidate) =>
      poolHasAda(candidate) &&
      hasKnownDecimals(candidate.assetA) &&
      hasKnownDecimals(candidate.assetB),
  );
  const usingDiscovered = discoveredAdaPools.length > 0;

  const options: Array<{ ident: string; label: string }> = usingDiscovered
    ? discoveredAdaPools.map((pool) => ({
        ident: pool.ident,
        label: `${labelFor(pool.assetA)} / ${labelFor(pool.assetB)}`,
      }))
    : POOL_PRESETS.map((preset) => ({
        ident: preset.ident,
        label: preset.label,
      }));

  // If the user's selection isn't in the current option set (e.g. discovery
  // just resolved, or the presets loaded first), fall back to the first
  // available option without a render-triggering effect.
  const effectiveIdent = options.some(
    (option) => option.ident === selectedIdent,
  )
    ? selectedIdent
    : (options[0]?.ident ?? selectedIdent);

  const discoveredPool = discoveredAdaPools.find(
    (pool) => pool.ident === effectiveIdent,
  );

  const poolDetailQuery = useQuery({
    queryKey: ["sundae", "pool", effectiveIdent],
    queryFn: () => queryProvider.findPoolDataByIdent({ ident: effectiveIdent }),
    enabled: networkCheck.isSuccess && Boolean(effectiveIdent),
    initialData: discoveredPool,
    refetchInterval: 15_000,
    retry: false,
  });

  const candidatePool = poolDetailQuery.data;
  const pool =
    candidatePool &&
    hasKnownDecimals(candidatePool.assetA) &&
    hasKnownDecimals(candidatePool.assetB)
      ? candidatePool
      : undefined;

  const offered: IPoolDataAsset | undefined = pool
    ? offeredAssetForDirection(pool, direction)
    : undefined;
  const received: IPoolDataAsset | undefined = pool
    ? receivedAssetForDirection(pool, direction)
    : undefined;

  const available =
    connected && offered
      ? offered.assetId === ADA_METADATA.assetId
        ? balanceLovelace
        : balanceLovelace === null
          ? null
          : (tokens.find(
              (token) => token.assetId === unitFromAssetId(offered.assetId),
            )?.quantity ?? 0n)
      : null;
  const walletBalanceQuery = useQuery({
    queryKey: ["wallet", "swap-balance", connectionId],
    queryFn: async () => {
      await refreshBalance();
      return Date.now();
    },
    enabled: connected,
    refetchInterval: 30_000,
    retry: false,
  });
  const history = useQuery({
    queryKey: [
      "sundae",
      "weekly-prices",
      effectiveIdent,
      pool?.assetA.decimals,
      pool?.assetB.decimals,
    ],
    queryFn: ({ signal }) => readWeeklyPoolPrices(pool!, signal),
    enabled: Boolean(pool),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
  const historicalPoints = history.data ?? [];
  const latestPrice = pool
    ? Number(pool.liquidity.bReserve) /
      10 ** pool.assetB.decimals! /
      (Number(pool.liquidity.aReserve) / 10 ** pool.assetA.decimals!)
    : null;
  const chartPoints = [
    ...historicalPoints,
    ...(latestPrice && !poolDetailQuery.isError
      ? [{ time: poolDetailQuery.dataUpdatedAt, price: latestPrice }]
      : []),
  ]
    .filter(
      (point) =>
        point.time >= poolDetailQuery.dataUpdatedAt - 7 * 24 * 60 * 60 * 1000,
    )
    .map((point) => ({
      time: point.time,
      value:
        offered?.assetId === pool?.assetA.assetId
          ? point.price
          : 1 / point.price,
    }));
  let minimumReceive = "—";
  let estimatedReceive = "-";
  let priceImpact = "-";
  let spotPrice = "-";
  let parsedAmount: bigint | null = null;
  let amountError: string | null = null;

  if (
    pool &&
    offered &&
    received &&
    hasKnownDecimals(offered) &&
    hasKnownDecimals(received)
  ) {
    spotPrice = spotPriceLabel(pool, offered, received, labelFor);
    try {
      parsedAmount = parseAssetAmount(
        amount,
        offered.decimals,
        labelFor(offered),
      );
      if (parsedAmount > 0n) {
        const supplied = new AssetAmount(parsedAmount, offered);
        const output = SundaeUtils.getMinReceivableFromSlippage(
          pool,
          supplied,
          0,
        ).amount;
        const minimum = SundaeUtils.getMinReceivableFromSlippage(
          pool,
          supplied,
          Number(slippagePercent) / 100,
        ).amount;
        minimumReceive = `${formatAssetAmount(minimum, received.decimals)} ${labelFor(received)}`;
        estimatedReceive = `${formatAssetAmount(output, received.decimals)} ${labelFor(received)}`;
        const impactBps = priceImpactBasisPoints(
          pool,
          offered,
          received,
          parsedAmount,
        );
        priceImpact = formatBasisPointsPercent(impactBps);
      }
    } catch (err) {
      amountError = err instanceof Error ? err.message : "Invalid amount.";
      parsedAmount = null;
    }
  }

  const swapMutation = useMutation<SwapResult, Error, number>({
    mutationFn: async (originatingConnection) => {
      if (!connected || !walletApi || connectionId !== originatingConnection) {
        throw new Error("Connect a wallet first.");
      }
      if (!pool || poolDetailQuery.isError) {
        throw new Error("Pool is still loading.");
      }
      if (!networkCheck.isSuccess || !referencesCheck.isSuccess) {
        throw new Error(
          "Dingo Preview and Sundae V3 references have not been verified.",
        );
      }
      if (!offered || !hasKnownDecimals(offered)) {
        throw new Error("This token does not have known decimal metadata.");
      }
      await refreshBalance();
      const current = useWalletStore.getState();
      if (
        current.walletApi !== walletApi ||
        current.status !== "connected" ||
        current.connectionId !== connectionId
      )
        throw new Error("Wallet connection changed. Review the order again.");
      const currentBalance =
        offered.assetId === ADA_METADATA.assetId
          ? current.balanceLovelace
          : current.balanceLovelace === null
            ? null
            : (current.tokens.find(
                (token) => token.assetId === unitFromAssetId(offered.assetId),
              )?.quantity ?? 0n);
      const requested = parseAssetAmount(
        amount,
        offered.decimals,
        labelFor(offered),
      );
      if (currentBalance === null || requested > currentBalance)
        throw new Error(
          "Insufficient or unavailable wallet balance. Refresh your wallet and try again.",
        );
      const { blaze } = await getBlaze(walletApi);
      const built = await buildSwapOrder({
        blaze,
        queryProvider,
        pool,
        amount,
        direction,
        slippagePercent,
      });
      const txHash = await built.signAndSubmit();
      return { txHash, connectionId: originatingConnection };
    },
    onSuccess: (result) => {
      const current = useWalletStore.getState();
      if (
        current.status === "connected" &&
        current.connectionId === result.connectionId
      )
        void refreshBalance();
    },
  });

  return (
    <div className="wallet-workbench swap-workbench">
      <PageIntro
        eyebrow="SundaeSwap V3 · on Dingo"
        title="Make the exchange."
        symbol="⇄"
      />
      <p className="mb-4 text-sm text-slate-500">
        Order construction through Dingo UTxO RPC only.{" "}
        {usingDiscovered
          ? "Pools discovered live from Dingo."
          : discoveredQuery.isError
            ? "Pool discovery failed; select from the known Preview pools below."
            : discoveredQuery.isFetching
              ? "Discovering pools from Dingo…"
              : !networkCheck.isSuccess
                ? "Pool discovery will start after network verification."
                : "Dingo returned no ADA-paired pools; showing the curated Preview pool list."}
      </p>

      {networkCheck.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-900 p-4 text-sm text-red-300"
        >
          Cannot verify Dingo’s Preview network: {networkCheck.error.message}{" "}
          <button type="button" onClick={() => void networkCheck.refetch()}>
            Retry network check
          </button>
        </div>
      )}
      {networkCheck.isPending && (
        <p role="status" className="text-sm text-slate-400">
          Checking Dingo’s Preview network…
        </p>
      )}
      <section className="swap-venue-card" aria-label="Swap venue">
        <div>
          <span className="eyebrow">Execution venue</span>
          <h2>
            SundaeSwap <span>V3</span>
          </h2>
          <p>Cardano Preview · test network</p>
        </div>
        <ol className="swap-execution-path">
          <li>
            <strong>01</strong> Sign an order
          </li>
          <li>
            <strong>02</strong> Submit through Dingo
          </li>
          <li>
            <strong>03</strong> Scooper executes in the pool
          </li>
        </ol>
        <p>
          Your funds enter the SundaeSwap order contract. A scooper must execute
          the order against the selected liquidity pool before you receive the
          swap output. Submitting the order does not complete the swap.
        </p>
        <details>
          <summary>Selected pool and contracts</summary>
          <dl>
            <dt>Pool identifier</dt>
            <dd>{effectiveIdent}</dd>
            <dt>Pool NFT</dt>
            <dd>
              <Link
                to={`/explorer/asset/${SUNDAE_V3_PROTOCOL.blueprint.validators.find((validator) => validator.title === "pool.mint")!.hash}${DatumBuilderV3.computePoolNftName(effectiveIdent)}`}
              >
                View liquidity pool NFT →
              </Link>
            </dd>
            {["order.spend", "pool.spend"].map((name) => (
              <div key={name}>
                <dt>
                  {name === "order.spend"
                    ? "Order contract hash"
                    : "Pool contract hash"}
                </dt>
                <dd>
                  {
                    SUNDAE_V3_PROTOCOL.blueprint.validators.find(
                      (validator) => validator.title === name,
                    )!.hash
                  }
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
      <div className="swap-trading-layout">
        <section className="swap-market-card">
          <div className="swap-market-heading">
            <span className="eyebrow">Pool exchange rate</span>
            <span className="live-tag">
              ● {poolDetailQuery.isError ? "Update failed" : "Live · 15 sec"}
            </span>
          </div>
          <h2>
            {offered ? labelFor(offered) : "…"} /{" "}
            {received ? labelFor(received) : "…"}
          </h2>
          <p className="swap-spot-price">{spotPrice}</p>
          {!pool ? (
            <div className="price-chart-empty" role="status">
              {poolDetailQuery.isError || networkCheck.isError
                ? "Price history is unavailable until pool data can be loaded."
                : "Loading pool data…"}
            </div>
          ) : history.isPending ? (
            <div className="price-chart-empty" role="status">
              Loading weekly pool history…
            </div>
          ) : history.error ? (
            <div role="alert" className="price-chart-empty">
              {history.error.message}
              <button type="button" onClick={() => void history.refetch()}>
                Retry price history
              </button>
            </div>
          ) : (
            <MarketChart points={chartPoints} label="Pool exchange rate" />
          )}
          <p className="swap-chart-caption">
            One week of pool reserve prices, sampled every six hours from
            Dingo’s on-chain transaction history, plus the live price.
            Crosshair: hover, touch, or use arrow keys. These are reserve
            snapshots, not trade candles.
          </p>
          <div className="swap-market-stats">
            <div>
              <small>Pool fee</small>
              <strong>
                {pool ? `${(pool.currentFee * 100).toFixed(3)}%` : "—"}
              </strong>
            </div>
            <div>
              <small>Observations</small>
              <strong>{chartPoints.length}</strong>
            </div>
            <div>
              <small>Price movement</small>
              <strong>
                {chartPoints.length > 1
                  ? `${((chartPoints.at(-1)!.value / chartPoints[0].value - 1) * 100).toFixed(2)}%`
                  : "Collecting"}
              </strong>
            </div>
          </div>
        </section>
        <div className="wallet-form-card swap-order-card flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Pool</span>
            <select
              aria-label="Pool"
              value={effectiveIdent}
              onChange={(event) => setSelectedIdent(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
            >
              {options.map((option) => (
                <option key={option.ident} value={option.ident}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              setDirection((d) =>
                d === "adaToToken" ? "tokenToAda" : "adaToToken",
              )
            }
            className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
          >
            Reverse direction
          </button>

          <div className="swap-balance-row">
            <span>
              Available:{" "}
              {available !== null && offered
                ? `${formatAssetAmount(available, offered.decimals)} ${labelFor(offered)}`
                : connected
                  ? "Checking wallet…"
                  : "Connect a wallet to see your balance"}
            </span>
            <button
              type="button"
              disabled={!connected}
              onClick={() => void walletBalanceQuery.refetch()}
            >
              Refresh
            </button>
          </div>
          <div className="swap-amount-shortcuts">
            {[
              25,
              50,
              75,
              ...(offered?.assetId !== ADA_METADATA.assetId ? [100] : []),
            ].map((percent) => (
              <button
                type="button"
                key={percent}
                disabled={available === null || !offered}
                onClick={() =>
                  available !== null &&
                  offered &&
                  setAmount(
                    formatAssetAmount(
                      (available * BigInt(percent)) / 100n,
                      offered.decimals,
                    ),
                  )
                }
              >
                {percent === 100 ? "Max" : `${percent}%`}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">
              {offered ? labelFor(offered) : "…"} offered
            </span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              disabled={!pool}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-slate-500 focus:outline-none disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Slippage</span>
            <select
              aria-label="Slippage"
              value={slippagePercent}
              onChange={(event) => setSlippagePercent(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
            >
              <option value="0.1">0.1%</option>
              <option value="0.5">0.5%</option>
              <option value="1">1%</option>
              <option value="2">2%</option>
              <option value="5">5%</option>
            </select>
          </label>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-slate-800 p-3 text-sm">
            <dt className="text-slate-500">Spot price</dt>
            <dd className="text-slate-200">{spotPrice}</dd>
            <dt className="text-slate-500">Receive (est.)</dt>
            <dd className="text-slate-200">{estimatedReceive}</dd>
            <dt className="text-slate-500">Minimum received</dt>
            <dd className="text-emerald-300">{minimumReceive}</dd>
            <dt className="text-slate-500">Slippage tolerance</dt>
            <dd>{slippagePercent}%</dd>
            <dt className="text-slate-500">Price impact</dt>
            <dd className="text-slate-200">{priceImpact}</dd>
            {pool && (
              <>
                <dt className="text-slate-500">LP fee</dt>
                <dd className="text-slate-200">
                  {(pool.currentFee * 100).toFixed(3)}%
                </dd>
              </>
            )}
          </dl>

          <p className="swap-chart-caption">
            The minimum received is encoded in your order. Slippage limits
            movement after the quote; price impact reflects this trade's effect
            on the pool. ADA is also needed for the order deposit, execution fee
            and network fee.
          </p>
          {available !== null &&
            parsedAmount !== null &&
            parsedAmount > available && (
              <p role="alert" className="text-sm text-red-400">
                Amount exceeds your wallet balance.
              </p>
            )}
          {connected && walletBalanceQuery.isError && (
            <p role="alert" className="text-sm text-red-400">
              Wallet balance refresh failed: {walletBalanceQuery.error.message}
            </p>
          )}
          {amountError && <p className="text-sm text-red-400">{amountError}</p>}
          {poolDetailQuery.isError && (
            <p className="text-sm text-red-400">
              Could not load the selected pool: {poolDetailQuery.error.message}
            </p>
          )}

          {connected && referencesCheck.isError && (
            <p role="alert" className="text-sm text-red-400">
              Order reference checks failed: {referencesCheck.error.message}{" "}
              <button
                type="button"
                onClick={() => void referencesCheck.refetch()}
              >
                Retry order checks
              </button>
            </p>
          )}
          {!connected && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-400">
                Explore pools, charts, and quotes without a wallet. Connect to
                sign and submit an order.
              </p>
              <WalletConnectSummary />
            </div>
          )}
          <button
            type="button"
            disabled={
              !connected ||
              !networkCheck.isSuccess ||
              !referencesCheck.isSuccess ||
              !pool ||
              poolDetailQuery.isError ||
              walletBalanceQuery.isError ||
              available === null ||
              (parsedAmount !== null && parsedAmount > available) ||
              !parsedAmount ||
              parsedAmount <= 0n ||
              swapMutation.isPending
            }
            onClick={() => {
              swapMutation.reset();
              swapMutation.mutate(connectionId);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
          >
            {swapMutation.isPending
              ? "Building, signing, submitting…"
              : !connected
                ? "Connect wallet to trade"
                : !networkCheck.isSuccess || !referencesCheck.isSuccess
                  ? "Order checks pending"
                  : !pool
                    ? "Loading pool…"
                    : "Sign & submit swap order"}
          </button>

          {connected &&
            swapMutation.variables === connectionId &&
            swapMutation.isError && (
              <p className="text-sm text-red-400">
                {swapMutation.error.message}
              </p>
            )}
          {connected &&
            swapMutation.isSuccess &&
            swapMutation.data.connectionId === connectionId && (
              <p className="text-sm text-emerald-400">
                Order submitted. Swap execution is separate.{" "}
                <Link
                  to={`/explorer/tx/${swapMutation.data.txHash}`}
                  className="underline"
                >
                  View order transaction
                </Link>
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
