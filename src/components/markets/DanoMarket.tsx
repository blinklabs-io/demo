import { DINGO_NETWORK } from "../../lib/dingo/config";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "../NetworkLink";
import { readDanoPool, readDanoPools, danoOutpoint, readDanoConfig } from "../../lib/dano/read";
import { quoteDano } from "../../lib/dano/data";
import {
  prepareDanoSwap,
  submitDanoSwap,
} from "../../lib/dano/transactions";
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
function danoAmount(quantity: bigint, asset: string) {
  return (
    chainAmount(quantity, asset) + (asset === "lovelace" ? "" : " base units")
  );
}

export function DanoMarket() { return DINGO_NETWORK.id === "mainnet" ? <DanoMainnet /> : <section className="market-hero"><h1>Dano on Mainnet</h1><Link to="/wallet/dano?network=mainnet">Open Mainnet swaps →</Link></section>; }
function DanoMainnet() {
  const [hash, submitted] = useState("");
  const tracking = { hash, submitted };
  const [cursors, setCursors] = useState([""]),
    [page, setPage] = useState(0),
    [chosen, setChosen] = useState(""),
    [lookup, setLookup] = useState("");
  const [directionState, setAToB] = useState(true),
    [amountState, setAmountState] = useState<{ pool: string | undefined; value: string }>({ pool: undefined, value: "0.1" });
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
    queryKey: ["dingo", "markets", "dano", "pools", cursors[page]],
    queryFn: ({ signal }) => readDanoPools(cursors[page], signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const config = useQuery({ queryKey: ["dingo", "markets", "dano", "configuration"], queryFn: ({ signal }) => readDanoConfig(signal), staleTime: 30000, refetchInterval: 30000, retry: false });
  const pools = catalog.data?.pools ?? [],
    name = chosen || (pools[0] ? danoOutpoint(pools[0]) : undefined);
  const listed = pools.find((pool) => danoOutpoint(pool) === name);
  const selection = useQuery({
    queryKey: ["dingo", "markets", "dano", "selected", name],
    enabled: !!name && !listed,
    queryFn: ({ signal }) => readDanoPool(name!, signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const pool = listed ?? selection.data;
  const aToB = amountState.pool === name ? directionState : true;
  const offered = pool ? (aToB ? pool.x : pool.y) : "lovelace",
    received = pool ? (aToB ? pool.y : pool.x) : "lovelace";
  const defaultAmount = offered === "lovelace" ? "0.1" : "1000000";
  const amount = amountState.pool === name ? amountState.value : defaultAmount;
  if (pool && amountState.pool !== name)
    setAmountState({ pool: name, value: defaultAmount });
  if (pool && amountState.pool !== name && !directionState) setAToB(true);
  let input = 0n,
    quote: ReturnType<typeof quoteDano> | undefined,
    error = "";
  if (pool && config.data)
    try {
      input = rawAmount(amount, offered);
      quote = quoteDano(pool, config.data, aToB, input);
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
  return (
    <section className="markets-page">
      <MarketConfirmation tracking={tracking} />
      <header className="market-hero">
        <div>
          <span className="eyebrow">Dano CLMM · Mainnet</span>
          <h1>A swap in one transaction.</h1>
          <p>
            Swap native tokens directly against concentrated liquidity, with amounts reviewed before
            your wallet signs. Dingo reads the chain and submits your
            transaction.
          </p>
          <a
            href="https://dano.finance/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Dano app ↗
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
                className={`market-card${danoOutpoint(candidate) === name ? " selected" : ""}`}
                aria-pressed={danoOutpoint(candidate) === name}
                onClick={() => {
                  setChosen(danoOutpoint(candidate));
                  setAToB(true);
                  setAmountState({ pool: danoOutpoint(candidate), value: candidate.x === "lovelace" ? "0.1" : "1000000" });
                }}
              >
                <strong>
                  {marketAssetName(candidate.x)} /{" "}
                  {marketAssetName(candidate.y)}
                </strong>
                <span>
                  <MarketAsset unit={candidate.x} /> +{" "}
                  <MarketAsset unit={candidate.y} />
                </span>
                <small>
                  {danoAmount(candidate.reserveX, candidate.x)} /{" "}
                  {danoAmount(candidate.reserveY, candidate.y)}
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
              Pool output reference
              <input
                required
                pattern="[a-fA-F0-9]{64}#[0-9]+"
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
              />
            </label>
            <button type="submit">Load pool</button>
          </form>
        </article>
        <article className="market-form">
          <h2>Review your swap</h2>
          {config.isPending && <MarketLoading retry={() => void config.refetch()} />}
          {config.error && <MarketLoading error={config.error} retry={() => void config.refetch()} />}
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
                    setAmountState({ pool: name, value: (forward ? pool.x : pool.y) === "lovelace" ? "0.1" : "1000000" });
                  }}
                >
                  <option value="a-to-b">
                    {marketAssetName(pool.x)} →{" "}
                    {marketAssetName(pool.y)}
                  </option>
                  <option value="b-to-a">
                    {marketAssetName(pool.y)} →{" "}
                    {marketAssetName(pool.x)}
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
                  onChange={(event) => setAmountState({ pool: name, value: event.target.value })}
                />
              </label>
              {wallet.status === "connected" && held != null && (
                <p>Wallet balance: {danoAmount(held, offered)}</p>
              )}
              {error && <p role="alert">{error}</p>}
              {quote && (
                <div className="market-quote">
                  <span>Receive</span>
                  <strong>{danoAmount(quote.received, received)}</strong>
                  <p>
                    Pool trading fee: {Number(pool.fee) / 100}% (includes {danoAmount(quote.platform, offered)} for the platform) · settlement fee: {danoAmount(quote.swapFee, "lovelace")}
                  </p>
                </div>
              )}
              {(pool.x === "lovelace" || pool.y === "lovelace") && <p>ADA pools require staking reward settlement and cannot be traded here.</p>}
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
                  config.data?.utxo.input().toCbor(),
                ])}
                ready={!!quote && !config.error && !(listed ? catalog.error : selection.error)}
                tracking={tracking}
                title="Review Dano CLMM swap"
                prepare={(api, assertCurrent) => {
                  if (!pool || !quote || !config.data)
                    throw new Error(
                      "Select a current pool and enter a valid amount.",
                    );
                  return prepareDanoSwap(
                    api,
                    {
                      poolName: pool.name,
                      configOutpoint: `${config.data.utxo.input().transactionId()}#${config.data.utxo.input().index()}`,
                      poolOutpoint: danoOutpoint(pool),
                      aToB,
                      amount: input,
                      minimum: quote.received,
                    },
                    assertCurrent,
                  );
                }}
                submit={(draft, api, assertCurrent) =>
                  submitDanoSwap(api, draft, assertCurrent)
                }
              />
              <details>
                <summary>Pool assets</summary>
                <p style={{ overflowWrap: "anywhere" }}>{pool.x}</p>
                <p style={{ overflowWrap: "anywhere" }}>{pool.y}</p>
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
