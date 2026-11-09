import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "../NetworkLink";
import { readRapidPool, readRapidPools } from "../../lib/wingriders/read";
import { quoteRapidSwap } from "../../lib/wingriders/data";
import {
  prepareRapidSwap,
  submitRapidSwap,
} from "../../lib/wingriders/transactions";
import { useTipStore } from "../../stores/tipStore";
import { useWalletStore } from "../../stores/walletStore";
import { MarketConfirmation, MarketTransaction } from "./MarketTransaction";
import { MarketAsset, MarketLoading } from "./assets";
import {
  marketAmount as chainAmount,
  marketAssetName,
  rawAmount,
} from "./amounts";
import "./markets.css";
function rapidAmount(quantity: bigint, asset: string) {
  return (
    chainAmount(quantity, asset) + (asset === "lovelace" ? "" : " base units")
  );
}

export function WingRidersMarket() {
  const [hash, submitted] = useState("");
  const tracking = { hash, submitted };
  const [cursors, setCursors] = useState([""]),
    [page, setPage] = useState(0),
    [chosen, setChosen] = useState(""),
    [lookup, setLookup] = useState("");
  const [aToB, setAToB] = useState(true),
    [amount, setAmount] = useState("0.1");
  const wallet = useWalletStore();
  useEffect(
    () =>
      useTipStore.subscribe((next, previous) => {
        if (
          next.revision !== previous.revision &&
          next.lastAction !== "apply"
        ) {
          setCursors([""]);
          setPage(0);
          setChosen("");
        }
      }),
    [],
  );
  const catalog = useQuery({
    queryKey: ["dingo", "markets", "wingriders", "pools", cursors[page]],
    queryFn: ({ signal }) => readRapidPools(cursors[page], signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const pools = catalog.data?.pools ?? [],
    name = chosen || pools[0]?.name;
  const listed = pools.find((pool) => pool.name === name);
  const selection = useQuery({
    queryKey: ["dingo", "markets", "wingriders", "selected", name],
    enabled: !!name && !listed,
    queryFn: ({ signal }) => readRapidPool(name!, signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const pool = listed ?? selection.data;
  const offered = pool ? (aToB ? pool.assetA : pool.assetB) : "lovelace",
    received = pool ? (aToB ? pool.assetB : pool.assetA) : "lovelace";
  let input = 0n,
    quote: ReturnType<typeof quoteRapidSwap> | undefined,
    error = "";
  if (pool)
    try {
      input = rawAmount(amount, offered);
      quote = quoteRapidSwap(pool, aToB, input);
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "Enter a valid input amount.";
    }
  const held =
    offered === "lovelace"
      ? wallet.balanceLovelace
      : wallet.tokens
          .filter((token) => token.assetId === offered)
          .reduce((sum, token) => sum + token.quantity, 0n);
  const feeOnInput =
      pool &&
      (pool.feeFrom === 0n ||
        (pool.feeFrom === 2n && aToB) ||
        (pool.feeFrom === 3n && !aToB)),
    feeAsset = feeOnInput ? offered : received;
  return (
    <section className="markets-page">
      <MarketConfirmation tracking={tracking} />
      <header className="market-hero">
        <div>
          <span className="eyebrow">WingRiders Rapid · Mainnet</span>
          <h1>A swap in one transaction.</h1>
          <p>
            Trade directly against the pool, with exact amounts reviewed before
            your wallet signs. Dingo reads the chain and submits your
            transaction.
          </p>
          <a
            href="https://www.wingriders.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official WingRiders app ↗
          </a>
        </div>
      </header>
      <div className="market-layout">
        <article className="market-catalog">
          <div className="market-toolbar">
            <h2>Live pools</h2>
            <span>Page {page + 1}</span>
          </div>
          {catalog.isPending && (
            <MarketLoading retry={() => void catalog.refetch()} />
          )}
          {catalog.error && (
            <p role="alert">
              {catalog.error.message}{" "}
              <button onClick={() => void catalog.refetch()}>
                Retry pools
              </button>
            </p>
          )}
          {catalog.data && !pools.length && (
            <p>No authenticated pools on this page.</p>
          )}
          <div className="market-grid">
            {pools.map((candidate) => (
              <button
                key={candidate.name}
                className={`market-card${candidate.name === name ? " selected" : ""}`}
                aria-pressed={candidate.name === name}
                onClick={() => {
                  setChosen(candidate.name);
                  setAToB(true);
                  setAmount(
                    candidate.assetA === "lovelace" ? "0.1" : "1000000",
                  );
                }}
              >
                <strong>
                  {marketAssetName(candidate.assetA)} /{" "}
                  {marketAssetName(candidate.assetB)}
                </strong>
                <span>
                  <MarketAsset unit={candidate.assetA} /> +{" "}
                  <MarketAsset unit={candidate.assetB} />
                </span>
                <small>
                  {rapidAmount(candidate.reserveA, candidate.assetA)} /{" "}
                  {rapidAmount(candidate.reserveB, candidate.assetB)}
                </small>
              </button>
            ))}
          </div>
          {catalog.data?.errors.length ? (
            <details>
              <summary>
                {catalog.data.errors.length} outputs could not be decoded
              </summary>
              {catalog.data.errors.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </details>
          ) : null}
          <div className="market-actions">
            <button
              disabled={!page}
              onClick={() => {
                setPage(page - 1);
                setChosen("");
              }}
            >
              Previous pools
            </button>
            <button
              disabled={!catalog.data?.nextToken}
              onClick={() => {
                const next = catalog.data?.nextToken;
                if (next) {
                  setCursors([...cursors.slice(0, page + 1), next]);
                  setPage(page + 1);
                  setChosen("");
                }
              }}
            >
              Next pools
            </button>
          </div>
          <form
            className="market-form"
            onSubmit={(event) => {
              event.preventDefault();
              setChosen(lookup.trim().toLowerCase());
            }}
          >
            <label>
              Pool identifier
              <input
                required
                pattern="[a-fA-F0-9]{64}"
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
              />
            </label>
            <button type="submit">Load pool</button>
          </form>
        </article>
        <article className="market-form">
          <h2>Review your swap</h2>
          {selection.isFetching && !pool && (
            <MarketLoading retry={() => void selection.refetch()} />
          )}
          {selection.error && (
            <p role="alert">
              {selection.error.message}{" "}
              <button onClick={() => void selection.refetch()}>
                Retry selected pool
              </button>
            </p>
          )}
          {pool && (
            <>
              <p>
                <MarketAsset unit={offered} /> → <MarketAsset unit={received} />
              </p>
              <label>
                Swap direction
                <select
                  aria-label="Swap direction"
                  value={aToB ? "a-to-b" : "b-to-a"}
                  onChange={(event) => {
                    const forward = event.target.value === "a-to-b";
                    setAToB(forward);
                    setAmount(
                      (forward ? pool.assetA : pool.assetB) === "lovelace"
                        ? "0.1"
                        : "1000000",
                    );
                  }}
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
              <label>
                {offered === "lovelace"
                  ? "ADA amount"
                  : `${marketAssetName(offered)} amount (base units)`}
                <input
                  inputMode={offered === "lovelace" ? "decimal" : "numeric"}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              {wallet.status === "connected" && held != null && (
                <p>Wallet balance: {rapidAmount(held, offered)}</p>
              )}
              {error && <p role="alert">{error}</p>}
              {quote && (
                <div className="market-quote">
                  <span>Receive</span>
                  <strong>{rapidAmount(quote.received, received)}</strong>
                  <p>
                    Pool fee: {rapidAmount(quote.swapFee, feeAsset)} · Treasury
                    fee:{" "}
                    {rapidAmount(quote.treasuryA + quote.treasuryB, feeAsset)}
                  </p>
                </div>
              )}
              <p>
                Token amounts use base units; ADA uses six decimal places. Swaps
                settle directly in one transaction. If the pool changes before
                submission, rebuild from its current state.
              </p>
              <MarketTransaction
                draftKey={JSON.stringify([
                  name,
                  pool.utxo.input().transactionId(),
                  String(pool.utxo.input().index()),
                  aToB,
                  input.toString(),
                  quote?.received.toString(),
                ])}
                ready={!!quote && !selection.error && !catalog.error}
                tracking={tracking}
                title="Review WingRiders Rapid swap"
                prepare={(api, assertCurrent) => {
                  if (!pool || !quote)
                    throw new Error(
                      "Select a current pool and enter a valid amount.",
                    );
                  return prepareRapidSwap(
                    api,
                    {
                      poolName: pool.name,
                      aToB,
                      amount: input,
                      minimum: quote.received,
                    },
                    assertCurrent,
                  );
                }}
                submit={(draft, api, assertCurrent) =>
                  submitRapidSwap(api, draft, assertCurrent)
                }
              />
              <details>
                <summary>Pool assets</summary>
                <p style={{ overflowWrap: "anywhere" }}>{pool.assetA}</p>
                <p style={{ overflowWrap: "anywhere" }}>{pool.assetB}</p>
                <Link to={`/explorer/tx/${pool.utxo.input().transactionId()}`}>
                  Current pool transaction ↗
                </Link>
              </details>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
