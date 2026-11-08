import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getDingoProvider,
  assertDingoNetwork,
} from "../../lib/dingo/utxorpc/provider";
import { DingoSundaeQueryProvider } from "../../lib/sundae/dingoQueryProvider";
import { POOL_PRESETS } from "../../lib/sundae/protocol";
import {
  parseLiquidityOrderReference,
  prepareLiquidityCancel,
  prepareLiquidity,
  quoteLiquidity,
  liquidityAssetUnit,
  type LiquidityAction,
} from "../../lib/sundae/liquidity";
import { useWalletStore } from "../../stores/walletStore";
import {
  MarketConfirmation,
  MarketTransaction,
  type MarketTracking,
} from "./MarketTransaction";
import { marketAmount, rawAmount } from "./amounts";
import { MarketAsset, MarketLoading } from "./assets";
import { Link } from "../NetworkLink";
import "./markets.css";

export function SundaeLiquidity({
  tracking: parentTracking,
}: {
  tracking?: MarketTracking;
}) {
  const [hash, submitted] = useState("");
  const tracking = parentTracking ?? { hash, submitted };
  const [ident, setIdent] = useState(POOL_PRESETS[0].ident);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amountA, setAmountA] = useState("5"),
    [amountB, setAmountB] = useState<string | null>(null),
    [lp, setLp] = useState("1000000");
  const [orderRef, setOrderRef] = useState("");
  const wallet = useWalletStore();
  const selected = POOL_PRESETS.find((p) => p.ident === ident)!;
  const pool = useQuery({
    queryKey: ["dingo", "markets", "sundae", "liquidity", ident],
    queryFn: async () => {
      const provider = getDingoProvider();
      await assertDingoNetwork(provider);
      return new DingoSundaeQueryProvider(provider).findPoolDataByIdent({
        ident,
      });
    },
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const data = pool.data;
  const a = data ? liquidityAssetUnit(data.assetA.assetId) : "lovelace";
  const b = data ? liquidityAssetUnit(data.assetB.assetId) : "";
  const lpUnit = data ? liquidityAssetUnit(data.assetLP.assetId) : "";
  let ratioAmount = "";
  if (data)
    try {
      ratioAmount = (
        (rawAmount(amountA, a) * data.liquidity.bReserve +
          data.liquidity.aReserve -
          1n) /
        data.liquidity.aReserve
      ).toString();
    } catch {
      /* Invalid input is reported with the quote. */
    }
  const tokenAmount = amountB ?? ratioAmount;
  let action: LiquidityAction | undefined,
    quote: ReturnType<typeof quoteLiquidity> | undefined,
    error = "";
  if (data)
    try {
      action =
        mode === "deposit"
          ? {
              type: mode,
              amountA: rawAmount(amountA, a),
              amountB: rawAmount(tokenAmount, b),
            }
          : { type: mode, lp: rawAmount(lp, lpUnit) };
      quote = quoteLiquidity(data, action);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Enter valid amounts.";
    }
  const balance = wallet.tokens
    .filter((token) => token.assetId === lpUnit)
    .reduce((total, token) => total + token.quantity, 0n);
  return (
    <section className="markets-page">
      {!parentTracking && <MarketConfirmation tracking={tracking} />}
      <header className="market-hero">
        <div>
          <span className="eyebrow">SundaeSwap V3 · Liquidity</span>
          <h1>A share of the pool.</h1>
          <p>
            Deposit both assets or exchange LP tokens for your share. Read pool
            reserves and submit orders through Dingo.
          </p>
          <a
            href="https://app.sundae.fi/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official SundaeSwap app ↗
          </a>
        </div>
      </header>
      <label className="market-form">
        Pool
        <select
          value={ident}
          onChange={(event) => {
            setIdent(event.target.value);
            setAmountA("5");
            setAmountB(null);
            setLp("1000000");
          }}
        >
          {POOL_PRESETS.map((preset) => (
            <option key={preset.ident} value={preset.ident}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      {pool.isPending && <MarketLoading retry={() => void pool.refetch()} />}
      {pool.error && (
        <p role="alert">
          {pool.error.message}{" "}
          <button onClick={() => void pool.refetch()}>Retry pool</button>
        </p>
      )}
      {data && (
        <div className="market-layout">
          <article className="market-catalog">
            <span className="eyebrow">Live reserves</span>
            <h2>{selected.label}</h2>
            <p>
              {marketAmount(data.liquidity.aReserve, a)} /{" "}
              {marketAmount(data.liquidity.bReserve, b)}
            </p>
            <p>
              {data.liquidity.lpTotal.toLocaleString()} LP base units in
              circulation
            </p>
            <p>
              <MarketAsset unit={a} /> + <MarketAsset unit={b} />
            </p>
            <p>
              Pool ID <span style={{ overflowWrap: "anywhere" }}>{ident}</span>
            </p>
            <p>
              LP policy and asset{" "}
              <span style={{ overflowWrap: "anywhere" }}>{lpUnit}</span>
            </p>
            {wallet.status === "connected" && (
              <p>Wallet: {balance.toLocaleString()} LP base units</p>
            )}
            <Link to={`/wallet/swap?venue=sundae`}>Swap assets →</Link>
          </article>
          <article className="market-form">
            <nav
              className="market-mode"
              aria-label="SundaeSwap liquidity action"
            >
              <button
                aria-pressed={mode === "deposit"}
                onClick={() => setMode("deposit")}
              >
                Deposit
              </button>
              <button
                aria-pressed={mode === "withdraw"}
                onClick={() => setMode("withdraw")}
              >
                Withdraw
              </button>
            </nav>
            {mode === "deposit" ? (
              <>
                <label>
                  ADA amount
                  <input
                    value={amountA}
                    inputMode="decimal"
                    onChange={(event) => setAmountA(event.target.value)}
                  />
                </label>
                <label>
                  {selected.assetBLabel} amount (base units)
                  <input
                    value={tokenAmount}
                    inputMode="numeric"
                    onChange={(event) => setAmountB(event.target.value)}
                  />
                </label>
                <button onClick={() => setAmountB(null)}>
                  Match current pool ratio
                </button>
              </>
            ) : (
              <label>
                LP amount (base units)
                <input
                  value={lp}
                  inputMode="numeric"
                  onChange={(event) => setLp(event.target.value)}
                />
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            {quote && (
              <div className="market-quote">
                <span>
                  {mode === "deposit"
                    ? "Estimated LP received"
                    : "Estimated assets received"}
                </span>
                <strong>
                  {mode === "deposit"
                    ? `${quote.lp.toLocaleString()} LP base units`
                    : `${marketAmount(quote.amountA, a)} + ${marketAmount(quote.amountB, b)}`}
                </strong>
                {mode === "deposit" && (
                  <p>
                    Estimated surplus returned: {marketAmount(quote.changeA, a)}{" "}
                    + {marketAmount(quote.changeB, b)}
                  </p>
                )}
              </div>
            )}
            <p>
              V3 liquidity orders use the pool ratio when the scooper executes
              them. Estimates can change; these orders have no minimum-return
              field. The order deposit is returned on execution, and the scooper
              fee is paid in ADA.
            </p>
            <MarketTransaction
              draftKey={JSON.stringify(
                [ident, mode, amountA, tokenAmount, lp, quote],
                (_, value) =>
                  typeof value === "bigint" ? value.toString() : value,
              )}
              ready={!!action && !!quote && !pool.error}
              title={
                mode === "deposit"
                  ? "Review liquidity deposit"
                  : "Review liquidity withdrawal"
              }
              tracking={tracking}
              prepare={async (api, assertCurrent) => {
                if (!data || !action)
                  throw new Error("Read a pool and enter valid amounts.");
                return prepareLiquidity(api, data, action, assertCurrent);
              }}
              submit={(draft) => draft.signAndSubmit()}
              review={(draft) => (
                <>
                  <p>
                    Refundable order deposit:{" "}
                    {marketAmount(draft.deposit, "lovelace")} · Scooper fee:{" "}
                    {marketAmount(draft.scooperFee, "lovelace")}
                  </p>
                  {draft.orderReferences.map((reference) => (
                    <p key={reference} style={{ overflowWrap: "anywhere" }}>
                      Order reference: {reference}
                    </p>
                  ))}
                </>
              )}
            />
          </article>
        </div>
      )}
      <section className="market-form">
        <h2>Cancel an unexecuted V3 order</h2>
        <p>
          Find the order output in its transaction. Cancellation returns the
          order assets to your wallet, minus the network fee.
        </p>
        <label>
          Order reference
          <input
            value={orderRef}
            placeholder="transaction-hash#output-index"
            onChange={(event) => setOrderRef(event.target.value)}
          />
        </label>
        {orderRef.trim() && !parseLiquidityOrderReference(orderRef) && (
          <p role="alert">
            Enter a transaction hash and output index from 0 to 65535, separated
            by #.
          </p>
        )}
        <MarketTransaction
          draftKey={orderRef}
          ready={!!parseLiquidityOrderReference(orderRef)}
          title="Review order cancellation"
          tracking={tracking}
          prepare={(api, assertCurrent) =>
            prepareLiquidityCancel(api, orderRef, assertCurrent)
          }
          submit={(draft) => draft.signAndSubmit()}
        />
      </section>
    </section>
  );
}
