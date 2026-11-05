import { useTipStore } from "../../stores/tipStore";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "../NetworkLink";
import { Gauge } from "../explorer/Visuals";
import { MarketChart } from "../explorer/MarketChart";
import { readMinswapHistory } from "../../lib/minswap/history";
import { PREPROD_MINSWAP_V2 } from "../../lib/minswap/constants";
import { useWalletStore } from "../../stores/walletStore";
import {
  readLiquidityPositions,
  readMinswapPools,
  readMinswapPool,
} from "../../lib/minswap/read";
import type { MinswapPool } from "../../lib/minswap/data";
import { readMinswapOrders } from "../../lib/minswap/orders";
import type { MinswapAction } from "../../lib/minswap/orders";
import {
  quoteDeposit,
  quoteSwap,
  quoteWithdraw,
} from "../../lib/minswap/quotes";
import {
  prepareMinswapAction,
  prepareMinswapCancel,
  submitMinswapTransaction,
} from "../../lib/minswap/transactions";
import {
  MarketTransaction,
  MarketConfirmation,
  type MarketTracking,
} from "./MarketTransaction";
import { MarketAsset, MarketLoading } from "./assets";
import { marketAmount, marketAssetName, rawAmount } from "./amounts";
import "./markets.css";

function ReserveCurve({ pool }: { pool: MinswapPool }) {
  const points = Array.from(
    { length: 41 },
    (_, i) => `${30 + i * 9},${185 - (i / 200 / (1 + i / 200)) * 800}`,
  ).join(" ");
  return (
    <figure className="market-illustration">
      <svg
        viewBox="0 0 420 235"
        role="img"
        aria-label="Current constant-product swap curve: increasing input produces diminishing output"
      >
        {[35, 85, 135, 185].map((y) => (
          <line className="chart-grid" key={y} x1="30" x2="400" y1={y} y2={y} />
        ))}
        <path
          className="chart-area"
          d={`M30 185 L${points.replaceAll(" ", " L")} L390 185 Z`}
        />
        <polyline className="chart-line" points={points} />
        <text x="30" y="207">
          0%
        </text>
        <text x="350" y="207">
          20% input
        </text>
        <text x="30" y="20">
          Output / pool reserve
        </text>
        <circle cx="30" cy="185" r="5" fill="#a791fa" />
        <text x="210" y="232" textAnchor="middle">
          Input asset → output asset
        </text>
      </svg>
      <figcaption>
        <MarketAsset unit={pool.assetA} /> → <MarketAsset unit={pool.assetB} />
        <br />
        Current reserve curve · before trading fees
      </figcaption>
    </figure>
  );
}
export function MinswapMarket({
  initialAction = "deposit",
  tracking: parentTracking,
}: {
  initialAction?: "deposit" | "swap";
  tracking?: MarketTracking;
}) {
  const [hash, setHash] = useState("");
  const tracking = parentTracking ?? { hash, submitted: setHash };
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<MinswapPool | null>(null);
  const [mode, setMode] = useState<"swap" | "deposit" | "withdraw">(
    initialAction,
  );
  const [direction, setDirection] = useState<"a-to-b" | "b-to-a">("a-to-b");
  const [amountA, setAmountA] = useState("5"),
    [amountB, setAmountB] = useState("0"),
    [lp, setLp] = useState("1"),
    [slippage, setSlippage] = useState("0.5");
  const wallet = useWalletStore();
  function available(unit: string) {
    if (wallet.balanceLovelace == null) return "Wallet balance unavailable";
    const quantity =
      unit === "lovelace"
        ? wallet.balanceLovelace
        : wallet.tokens
            .filter((token) => token.assetId === unit)
            .reduce((sum, token) => sum + token.quantity, 0n);
    return `Wallet UTxO balance: ${marketAmount(quantity, unit)}`;
  }
  const [orderPage, setOrderPage] = useState(1);
  useEffect(
    () =>
      useTipStore.subscribe((next, previous) => {
        if (
          next.revision !== previous.revision &&
          next.lastAction !== "apply"
        ) {
          setPage(1);
          setChosen(null);
          setOrderPage(1);
        }
      }),
    [],
  );
  const pools = useQuery({
    queryKey: ["dingo", "markets", "minswap", "pools", page],
    queryFn: ({ signal }) => readMinswapPools(page, signal),
    staleTime: 30000,
    refetchInterval: 30000,
  });
  const ranked = (pools.data?.pools ?? []).toSorted((a, b) =>
    a.assetA === "lovelace" && b.assetA !== "lovelace"
      ? -1
      : b.assetA === "lovelace" && a.assetA !== "lovelace"
        ? 1
        : a.assetA === "lovelace" && b.assetA === "lovelace"
          ? a.reserveA > b.reserveA
            ? -1
            : a.reserveA < b.reserveA
              ? 1
              : 0
          : 0,
  );
  const listed = ranked.find((p) => p.id === chosen?.id);
  const selectedPool = useQuery({
    queryKey: ["dingo", "markets", "minswap", "selected", chosen?.id],
    enabled: !!chosen && !listed,
    queryFn: ({ signal }) => readMinswapPool(chosen!, signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const pool = chosen ? (listed ?? selectedPool.data) : ranked[0];
  const history = useQuery({
    queryKey: ["dingo", "markets", "minswap", "history", pool?.id],
    enabled: !!pool,
    queryFn: ({ signal }) => readMinswapHistory(pool!, signal),
    staleTime: 6 * 3600000,
    retry: false,
  });
  const balanceKey = wallet.tokens
    .filter(
      (t) =>
        t.assetId.startsWith(PREPROD_MINSWAP_V2.lpPolicyId) &&
        t.assetId.length === 120,
    )
    .map((t) => `${t.assetId}:${t.quantity}`)
    .join("|");
  const positions = useQuery({
    queryKey: [
      "dingo",
      "markets",
      "minswap",
      "positions",
      wallet.connectionId,
      balanceKey,
    ],
    enabled: wallet.status === "connected",
    queryFn: ({ signal }) => readLiquidityPositions(wallet.tokens, signal),
    staleTime: 30000,
  });
  const orderSenders = [
    ...new Set(
      [wallet.changeAddress, ...wallet.usedAddresses].filter(
        (address): address is string => !!address,
      ),
    ),
  ].sort();
  const orderSenderKey = orderSenders.join("|");
  const walletIdentity = `${wallet.connectionId}:${orderSenderKey}`;
  const [orderWallet, setOrderWallet] = useState(walletIdentity);
  if (orderWallet !== walletIdentity) {
    setOrderWallet(walletIdentity);
    setOrderPage(1);
  }
  const orders = useQuery({
    queryKey: [
      "dingo",
      "markets",
      "minswap",
      "orders",
      orderSenderKey,
      orderPage,
    ],
    enabled: wallet.status === "connected" && orderSenders.length > 0,
    queryFn: ({ signal }) => readMinswapOrders(orderSenders, orderPage, signal),
    staleTime: 30000,
  });
  const rows = ranked.filter((p) =>
    `${marketAssetName(p.assetA)} ${marketAssetName(p.assetB)} ${p.assetA} ${p.assetB} ${p.id}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  const slippageMatch = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(slippage.trim());
  const bps = slippageMatch
    ? Number(slippageMatch[1]) * 100 +
      Number((slippageMatch[2] ?? "").padEnd(2, "0"))
    : NaN;
  let action: MinswapAction | null = null,
    quoteError = "",
    impact = 0;
  let swapQuote: ReturnType<typeof quoteSwap> | undefined,
    depositQuote: ReturnType<typeof quoteDeposit> | undefined,
    withdrawQuote: ReturnType<typeof quoteWithdraw> | undefined;
  if (pool)
    try {
      if (!Number.isSafeInteger(bps) || bps < 0 || bps >= 10000)
        throw new Error(
          "Enter slippage from 0 to less than 100%, with at most two decimal places.",
        );
      if (mode === "swap") {
        const assetIn = direction === "a-to-b" ? pool.assetA : pool.assetB;
        const amount = rawAmount(amountA, assetIn),
          result = quoteSwap(pool, direction, amount, bps);
        if (result.minimum <= 0n)
          throw new Error(
            "Amount is too small to receive a positive minimum output.",
          );
        action = { kind: "swap", direction, amount, slippageBps: bps };
        impact = result.priceImpactBps / 100;
        swapQuote = result;
      } else if (mode === "deposit") {
        const a = rawAmount(amountA, pool.assetA),
          b = rawAmount(amountB, pool.assetB),
          result = quoteDeposit(pool, a, b, bps);
        if (result.minimum <= 0n)
          throw new Error(
            "Increase the deposit to receive at least one LP base unit.",
          );
        action = { kind: "deposit", amountA: a, amountB: b, slippageBps: bps };
        depositQuote = result;
      } else {
        const amount = rawAmount(lp, pool.lpAsset),
          result = quoteWithdraw(pool, amount, bps);
        if (result.minimumA <= 0n || result.minimumB <= 0n)
          throw new Error("Increase the LP amount to receive both assets.");
        action = { kind: "withdraw", lpAmount: amount, slippageBps: bps };
        withdrawQuote = result;
      }
    } catch (error) {
      quoteError =
        error instanceof Error ? error.message : "Enter valid amounts.";
    }
  const quote =
    pool && swapQuote ? (
      <>
        <span className="eyebrow">Estimated output</span>
        <strong>
          {marketAmount(
            swapQuote.expected,
            direction === "a-to-b" ? pool.assetB : pool.assetA,
          )}
        </strong>
        <p>
          Minimum{" "}
          {marketAmount(
            swapQuote.minimum,
            direction === "a-to-b" ? pool.assetB : pool.assetA,
          )}{" "}
          after slippage.
        </p>
      </>
    ) : pool && depositQuote ? (
      <>
        <span className="eyebrow">Estimated liquidity tokens</span>
        <strong>{depositQuote.expected.toLocaleString()} LP</strong>
        <p>
          Minimum {depositQuote.minimum.toLocaleString()} LP.{" "}
          {depositQuote.imbalanced
            ? "Imbalanced deposit includes an internal pool swap."
            : "Balanced at the current reserve ratio."}
        </p>
      </>
    ) : pool && withdrawQuote ? (
      <>
        <span className="eyebrow">Estimated returned assets</span>
        <strong>{marketAmount(withdrawQuote.amountA, pool.assetA)}</strong>
        <strong>{marketAmount(withdrawQuote.amountB, pool.assetB)}</strong>
        <p>
          Minimums {marketAmount(withdrawQuote.minimumA, pool.assetA)} +{" "}
          {marketAmount(withdrawQuote.minimumB, pool.assetB)}.
        </p>
      </>
    ) : null;
  const draftKey = JSON.stringify([
    pool?.txHash,
    pool?.outputIndex,
    mode,
    direction,
    amountA,
    amountB,
    lp,
    slippage,
  ]);
  return (
    <div className="markets-page">
      {!parentTracking && <MarketConfirmation tracking={tracking} />}
      <section className="market-hero">
        <div>
          <span className="eyebrow">
            Minswap V2 · Preprod · powered by Dingo
          </span>
          <h1>
            {initialAction === "swap" ? (
              <>
                Trade from
                <br />
                <em>on-chain liquidity.</em>
              </>
            ) : (
              <>
                Put liquidity
                <br />
                <em>in motion.</em>
              </>
            )}
          </h1>
          <p>
            Read the pool. See the quote. Add or remove liquidity, track your
            positions, and manage orders without a separate indexer.
          </p>
          <div className="market-source">
            <span>Venue: Minswap V2</span>
            <span>Quotes: local calculations</span>
            <span>Data & submission: Dingo</span>
            <a
              href="https://github.com/minswap/sdk"
              target="_blank"
              rel="noreferrer"
            >
              Protocol source ↗
            </a>
          </div>
        </div>
        {pool ? (
          <ReserveCurve pool={pool} />
        ) : (
          <div className="market-skeleton" />
        )}
      </section>
      {!pools.data ? (
        <MarketLoading error={pools.error} retry={() => void pools.refetch()} />
      ) : (
        <>
          {pools.error && (
            <div className="market-help">
              <p role="alert">
                Could not refresh this pool page: {pools.error.message}. Showing
                the last loaded pools.
              </p>
              <button onClick={() => void pools.refetch()}>
                Retry pool refresh
              </button>
            </div>
          )}
          <div className="market-stats">
            <div>
              <span className="eyebrow">This page</span>
              <strong>{pools.data?.pools.length} pools</strong>
              <small>20 outputs maximum per query</small>
            </div>
            <div>
              <span className="eyebrow">
                {wallet.status === "connected"
                  ? "Your LP positions"
                  : "Selected pool fee"}
              </span>
              <strong>
                {wallet.status === "connected"
                  ? (positions.data?.positions.length ?? "…")
                  : pool
                    ? `${Number(mode === "swap" && direction === "b-to-a" ? pool.feeB : pool.feeA) / 100}%`
                    : "…"}
              </strong>
              <small>
                {wallet.status !== "connected"
                  ? "Published input-side base fee"
                  : positions.data?.partial
                    ? "First 20 wallet LP assets"
                    : "Resolved directly from held LP assets"}
              </small>
            </div>
            <div>
              <span className="eyebrow">
                {wallet.status === "connected"
                  ? "Your pending orders"
                  : "Market data"}
              </span>
              <strong>
                {wallet.status === "connected"
                  ? (orders.data?.orders.length ?? "…")
                  : "Direct from Dingo"}
              </strong>
              <small>Orders settle through Minswap batchers</small>
            </div>
          </div>
          <section className="market-catalog">
            <span className="eyebrow">Weekly pool price · 6-hour samples</span>
            <h2>
              {pool
                ? `${marketAssetName(pool.assetB)}${pool.assetB === "lovelace" ? "" : " base units"} per ${marketAssetName(pool.assetA)}${pool.assetA === "lovelace" ? "" : " base unit"}`
                : "Pool price"}
            </h2>
            {history.isPending ? (
              <p role="status">Reading verified historical pool states…</p>
            ) : history.error ? (
              <p role="alert">
                {history.error.message}{" "}
                <button onClick={() => void history.refetch()}>
                  Retry price history
                </button>
              </p>
            ) : history.data?.points.length ? (
              <MarketChart
                points={history.data.points.map((point) => ({
                  ...point,
                  value:
                    (point.value *
                      (pool?.assetA === "lovelace" ? 1000000 : 1)) /
                    (pool?.assetB === "lovelace" ? 1000000 : 1),
                }))}
                label="Minswap reserve exchange rate"
              />
            ) : (
              <p className="market-help">
                No verified historical samples were found for this pool in the
                bounded window.
              </p>
            )}
            {history.data?.partial && (
              <p className="market-help">
                The bounded history window has incomplete samples. Only
                transactions with a verified pool output contribute prices.
              </p>
            )}
          </section>
          {selectedPool.error && (
            <p className="tool-error" role="alert">
              {selectedPool.error.message}{" "}
              <button onClick={() => void selectedPool.refetch()}>
                Retry selected pool
              </button>
            </p>
          )}
          <div className="market-layout">
            <section className="market-catalog">
              <div className="market-toolbar">
                <div>
                  <span className="eyebrow">Live pool UTxOs</span>
                  <h2>Choose your market</h2>
                </div>
                <button
                  onClick={() => {
                    void pools.refetch();
                    if (wallet.status === "connected") void positions.refetch();
                    if (chosen && !listed) void selectedPool.refetch();
                  }}
                >
                  Refresh ↻
                </button>
              </div>
              <input
                className="market-search"
                type="search"
                aria-label="Filter Minswap pools"
                placeholder="Filter this page by asset, policy or pool ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="market-grid">
                {rows.map((p) => (
                  <button
                    key={p.id}
                    className={`market-card${pool?.id === p.id ? " selected" : ""}`}
                    aria-pressed={pool?.id === p.id}
                    onClick={() => setChosen(p)}
                  >
                    <span className="market-pair">
                      <MarketAsset unit={p.assetA} />
                      <span>/</span>
                      <MarketAsset unit={p.assetB} />
                    </span>
                    <strong>{marketAmount(p.reserveA, p.assetA)}</strong>
                    <small>{marketAmount(p.reserveB, p.assetB)}</small>
                    <span className="market-terms">
                      <span>{Number(p.feeA) / 100}% fee</span>
                      <span>
                        {p.dynamicFee ? "Dynamic fee enabled" : "Fixed fee"}
                      </span>
                    </span>
                    <small>Pool {p.id.slice(-12)}</small>
                  </button>
                ))}
              </div>
              {!rows.length && (
                <div className="market-empty">
                  <strong>No matching pools on this page</strong>
                  <p>Change the filter or try another page.</p>
                </div>
              )}
              {!!pools.data?.errors.length && (
                <p role="status" className="market-help">
                  {pools.data.errors.length} unsupported pool records were
                  excluded.
                </p>
              )}
              <div className="market-pagination">
                <button
                  disabled={page === 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setChosen(null);
                  }}
                >
                  ← Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={!pools.data?.partial}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setChosen(null);
                  }}
                >
                  Next pools →
                </button>
              </div>
            </section>
            {pool && (
              <section className="market-form">
                <h2>
                  <MarketAsset unit={pool.assetA} /> /{" "}
                  <MarketAsset unit={pool.assetB} />
                </h2>
                <div className="market-mode">
                  {(["swap", "deposit", "withdraw"] as const).map((m) => (
                    <button
                      key={m}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {m === "swap"
                        ? "Swap"
                        : m === "deposit"
                          ? "Add liquidity"
                          : "Remove liquidity"}
                    </button>
                  ))}
                </div>
                {mode === "swap" && (
                  <label>
                    Direction
                    <select
                      value={direction}
                      onChange={(e) =>
                        setDirection(e.target.value as typeof direction)
                      }
                    >
                      <option value="a-to-b">
                        {marketAssetName(pool.assetA)} →{" "}
                        {marketAssetName(pool.assetB)}
                      </option>
                      <option value="b-to-a">
                        {marketAssetName(pool.assetB)} →{" "}
                        {marketAssetName(pool.assetA)}
                      </option>
                    </select>
                  </label>
                )}
                {mode !== "withdraw" && (
                  <label>
                    {mode === "swap" && direction === "b-to-a"
                      ? marketAssetName(pool.assetB)
                      : marketAssetName(pool.assetA)}{" "}
                    amount
                    <input
                      inputMode="decimal"
                      value={amountA}
                      onChange={(e) => setAmountA(e.target.value)}
                    />
                    <small>
                      {(mode === "swap" && direction === "b-to-a"
                        ? pool.assetB
                        : pool.assetA) === "lovelace"
                        ? "ADA"
                        : "Token base units; no decimal scale is assumed."}
                    </small>
                    {wallet.status === "connected" && (
                      <small>
                        {available(
                          mode === "swap" && direction === "b-to-a"
                            ? pool.assetB
                            : pool.assetA,
                        )}
                      </small>
                    )}
                  </label>
                )}
                {mode === "deposit" && (
                  <label>
                    {marketAssetName(pool.assetB)} amount
                    <input
                      inputMode="numeric"
                      value={amountB}
                      onChange={(e) => setAmountB(e.target.value)}
                    />
                    <small>
                      Token base units · zero permits a single-sided deposit.
                    </small>
                    {wallet.status === "connected" && (
                      <small>{available(pool.assetB)}</small>
                    )}
                  </label>
                )}
                {mode === "withdraw" && (
                  <label>
                    LP tokens to redeem
                    <input
                      inputMode="numeric"
                      value={lp}
                      onChange={(e) => setLp(e.target.value)}
                    />
                    <small>Whole LP base units</small>
                    {wallet.status === "connected" && (
                      <small>{available(pool.lpAsset)}</small>
                    )}
                  </label>
                )}
                <label>
                  Slippage tolerance (%)
                  <input
                    type="number"
                    min="0"
                    max="99.99"
                    step="0.1"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                  />
                </label>
                {quote ? (
                  <div className="market-quote">{quote}</div>
                ) : (
                  <p role="status" className="market-help">
                    {quoteError}
                  </p>
                )}
                {mode === "swap" && action && (
                  <div className="market-gauge">
                    <Gauge
                      label="Price impact including pool fee"
                      value={impact}
                      tone={
                        impact >= 5 ? "red" : impact >= 1 ? "amber" : "teal"
                      }
                    />
                  </div>
                )}
                {pool.dynamicFee && mode !== "withdraw" && (
                  <p className="market-help">
                    This estimate uses the pool’s published base fee. Its
                    effective dynamic fee may differ; your on-chain minimum
                    remains enforced and an unfilled order can be cancelled.
                  </p>
                )}
                <p className="market-help">
                  A Minswap order is not an instant trade. A batcher executes
                  it. The order includes a 2 ADA execution fee and 2 ADA
                  deposit; the deposit returns with settlement or cancellation.
                </p>
                <MarketTransaction
                  tracking={tracking}
                  draftKey={draftKey}
                  ready={!!action}
                  title="Create a Minswap order"
                  prepare={(api, guard) =>
                    prepareMinswapAction(api, pool, action!, guard)
                  }
                  submit={(draft, api, guard) =>
                    submitMinswapTransaction(api, draft, guard)
                  }
                />
              </section>
            )}
          </div>
        </>
      )}
      {wallet.status === "connected" && (
        <>
          <section className="market-positions">
            <span className="eyebrow">Your liquidity</span>
            <h2>Positions, unpacked.</h2>
            {positions.isPending ? (
              <p>Reading your LP assets…</p>
            ) : positions.error ? (
              <p role="alert">{positions.error.message}</p>
            ) : !positions.data?.positions.length ? (
              <p className="market-help">
                {positions.data?.errors.length
                  ? "Some held LP positions could not be resolved. Refresh to retry."
                  : "No Minswap V2 liquidity tokens found in this wallet."}
              </p>
            ) : (
              positions.data.positions.map((position) => (
                <div className="market-position" key={position.pool.id}>
                  <div>
                    <MarketAsset unit={position.pool.assetA} /> /{" "}
                    <MarketAsset unit={position.pool.assetB} />
                    <p>
                      {position.lpAmount.toLocaleString()} LP ·{" "}
                      {(position.shareBps / 100).toFixed(2)}% pool share
                    </p>
                  </div>
                  <strong>
                    {marketAmount(position.amountA, position.pool.assetA)} +{" "}
                    {marketAmount(position.amountB, position.pool.assetB)}
                  </strong>
                  <button
                    onClick={() => {
                      setChosen(position.pool);
                      setMode("withdraw");
                      setLp(position.lpAmount.toString());
                    }}
                  >
                    Manage position ↑
                  </button>
                </div>
              ))
            )}
            {positions.data?.errors.map((message, i) => (
              <p role="status" key={i}>
                {message}
              </p>
            ))}
          </section>
          <section className="market-positions">
            <span className="eyebrow">Pending orders</span>
            <h2>Manage your orders</h2>
            {orders.error ? (
              <p role="alert">{orders.error.message}</p>
            ) : orders.isPending ? (
              <p>Reading orders…</p>
            ) : !orders.data?.orders.length ? (
              <p className="market-help">
                No open orders on this page for your current wallet address.
              </p>
            ) : (
              orders.data.orders.map((order) => (
                <div
                  className="market-position"
                  key={`${order.txHash}#${order.outputIndex}`}
                >
                  <div>
                    <strong>{order.kind}</strong>
                    <p className="market-help">
                      {order.txHash.slice(0, 16)}…#{order.outputIndex}
                    </p>
                  </div>
                  <MarketTransaction
                    tracking={tracking}
                    draftKey={`cancel:${order.txHash}:${order.outputIndex}`}
                    ready
                    title="Cancel order"
                    prepare={(api, guard) =>
                      prepareMinswapCancel(api, order, guard)
                    }
                    submit={(draft, api, guard) =>
                      submitMinswapTransaction(api, draft, guard)
                    }
                  />
                </div>
              ))
            )}
            <div className="market-pagination">
              <button
                disabled={orderPage === 1}
                onClick={() => setOrderPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <span>Page {orderPage}</span>
              <button
                disabled={!orders.data?.partial}
                onClick={() => setOrderPage((p) => p + 1)}
              >
                Next orders →
              </button>
            </div>
          </section>
        </>
      )}
      <p className="market-help">
        All pool and order reads go to Dingo.{" "}
        <Link to="/api">Inspect the available APIs ↗</Link>
      </p>
    </div>
  );
}
