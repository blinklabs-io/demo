import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ADA_METADATA, type IPoolData, type IPoolDataAsset } from "@sundaeswap/core";
import { useWalletStore } from "../../stores/walletStore";
import { assertDingoNetwork, getDingoProvider } from "../../lib/dingo/utxorpc/provider";
import { getBlaze } from "../../lib/dingo/blaze";
import { DingoSundaeQueryProvider } from "../../lib/sundae/dingoQueryProvider";
import { POOL_PRESETS, type PoolPreset } from "../../lib/sundae/protocol";
import { formatAssetAmount } from "../../lib/sundae/assets";
import { parseAssetAmount } from "../../lib/dingo/amount";
import { buildSwapOrder, type SwapDirection } from "../../lib/sundae/swap";
import {
  offeredAssetForDirection,
  receivedAssetForDirection,
  quoteOutput,
  priceImpactBasisPoints,
  formatBasisPointsPercent,
  spotPriceLabel,
  poolHasAda,
} from "../../lib/sundae/pricing";

function labelFor(asset: { assetId: string; ticker?: string }): string {
  if (asset.assetId === ADA_METADATA.assetId) {
    return "ADA";
  }
  return asset.ticker ?? `${asset.assetId.slice(0, 8)}...${asset.assetId.slice(-6)}`;
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
}

export default function WalletSwap() {
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const refreshBalance = useWalletStore((state) => state.refreshBalance);

  const queryProvider = useMemo(() => {
    const provider = new DingoSundaeQueryProvider(getDingoProvider());
    for (const preset of POOL_PRESETS) {
      provider.setAssetHint(preset.assetBAssetId, {
        label: preset.assetBLabel,
        decimals: preset.assetBDecimals,
      });
    }
    return provider;
  }, []);

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
    enabled: status === "connected",
  });
  const referencesCheck = useQuery({
    queryKey: ["sundae", "validate-references"],
    queryFn: () => queryProvider.validateProtocolReferences(),
    enabled: status === "connected" && networkCheck.isSuccess,
    retry: false,
  });

  const [direction, setDirection] = useState<SwapDirection>("adaToToken");
  const [selectedIdent, setSelectedIdent] = useState(POOL_PRESETS[0].ident);
  const [amount, setAmount] = useState("5");
  const [slippagePercent, setSlippagePercent] = useState("1");

  // Try to discover live ADA-paired Sundae V3 pools through Dingo; fall back
  // to the curated preset list (see dingo-sundae-preview's README) if Dingo
  // has none, or isn't reachable yet.
  const discoveredQuery = useQuery({
    queryKey: ["sundae", "discover-pools"],
    queryFn: () => queryProvider.discoverPools(),
    retry: false,
    enabled: status === "connected",
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
    : POOL_PRESETS.map((preset: PoolPreset) => ({
        ident: preset.ident,
        label: preset.label,
      }));

  // If the user's selection isn't in the current option set (e.g. discovery
  // just resolved, or the presets loaded first), fall back to the first
  // available option without a render-triggering effect.
  const effectiveIdent = options.some((option) => option.ident === selectedIdent)
    ? selectedIdent
    : (options[0]?.ident ?? selectedIdent);

  const discoveredPool = discoveredAdaPools.find(
    (pool) => pool.ident === effectiveIdent,
  );

  const poolDetailQuery = useQuery({
    queryKey: ["sundae", "pool", effectiveIdent],
    queryFn: () => queryProvider.findPoolDataByIdent({ ident: effectiveIdent }),
    enabled:
      status === "connected" && !discoveredPool && Boolean(effectiveIdent),
  });

  const candidatePool: IPoolData | undefined = discoveredPool ?? poolDetailQuery.data;
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
      parsedAmount = parseAssetAmount(amount, offered.decimals, labelFor(offered));
      if (parsedAmount > 0n) {
        const output = quoteOutput(pool, offered, received, parsedAmount);
        estimatedReceive = `${formatAssetAmount(output, received.decimals)} ${labelFor(received)}`;
        const impactBps = priceImpactBasisPoints(pool, offered, received, parsedAmount);
        priceImpact = formatBasisPointsPercent(impactBps);
      }
    } catch (err) {
      amountError = err instanceof Error ? err.message : "Invalid amount.";
      parsedAmount = null;
    }
  }

  const swapMutation = useMutation<SwapResult, Error>({
    mutationFn: async () => {
      if (!walletApi) {
        throw new Error("Connect a wallet first.");
      }
      if (!pool) {
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
      return { txHash };
    },
    onSuccess: () => {
      void refreshBalance();
    },
  });

  if (status !== "connected") {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Connect a wallet from the header to build a SundaeSwap order.
      </div>
    );
  }

  if (networkCheck.isError || referencesCheck.isError) {
    const error = (networkCheck.error ?? referencesCheck.error) as Error;
    return (
      <div className="rounded-md border border-red-900 bg-red-950 p-6 text-center text-sm text-red-200">
        Can't build SundaeSwap orders against this Dingo instance: {error.message}
      </div>
    );
  }

  if (networkCheck.isLoading || (networkCheck.isSuccess && referencesCheck.isLoading)) {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Checking Dingo is on Preview with Sundae V3 reference UTxOs indexed…
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-lg font-semibold text-white">SundaeSwap V3</h1>
      <p className="mb-4 text-sm text-slate-500">
        Order construction through Dingo UTxO RPC only.{" "}
        {usingDiscovered
          ? "Pools discovered live from Dingo."
          : discoveredQuery.isLoading
            ? "Discovering pools from Dingo…"
            : "Dingo returned no ADA-paired pools; showing the curated Preview pool list."}
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Pool</span>
          <select
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
          onClick={() => setDirection((d) => (d === "adaToToken" ? "tokenToAda" : "adaToToken"))}
          className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
        >
          Reverse direction
        </button>

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
          <dt className="text-slate-500">Price impact</dt>
          <dd className="text-slate-200">{priceImpact}</dd>
          {pool && (
            <>
              <dt className="text-slate-500">LP fee</dt>
              <dd className="text-slate-200">{(pool.currentFee * 100).toFixed(3)}%</dd>
            </>
          )}
        </dl>

        {amountError && <p className="text-sm text-red-400">{amountError}</p>}
        {poolDetailQuery.isError && (
          <p className="text-sm text-red-400">
            Could not load the selected pool: {poolDetailQuery.error.message}
          </p>
        )}

        <button
          type="button"
          disabled={!pool || !parsedAmount || parsedAmount <= 0n || swapMutation.isPending}
          onClick={() => {
            swapMutation.reset();
            swapMutation.mutate();
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
        >
          {swapMutation.isPending
            ? "Building, signing, submitting…"
            : !pool
              ? "Loading pool…"
              : "Swap"}
        </button>

        {swapMutation.isError && (
          <p className="text-sm text-red-400">{swapMutation.error.message}</p>
        )}
        {swapMutation.isSuccess && (
          <p className="text-sm text-emerald-400">
            Submitted.{" "}
            <Link
              to={`/explorer/tx/${swapMutation.data.txHash}`}
              className="underline"
            >
              View in Explorer
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
