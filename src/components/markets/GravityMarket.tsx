import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import {
  readGravityPools,
  readGravityPoolComposition,
} from "../../lib/gravity/read";
import {
  GRAVITY_INDEXER_POLICY,
  GRAVITY_ADA_INDEXER_ASSET,
} from "../../lib/gravity/data";
import { useTipStore } from "../../stores/tipStore";
import { UtxoConstellation } from "../chain/UtxoConstellation";
import { MarketAsset, MarketLoading } from "./assets";
import { marketAmount, marketAssetName } from "./amounts";
import { Link } from "../NetworkLink";
import { CopyButton } from "../explorer/CopyButton";
import "./markets.css";

const poolTypes = [
  "ADA / token",
  "Token / token",
  "Stable token pair",
  "Stable ADA pair",
];
export function GravityMarket() {
  const [page, setPage] = useState(1),
    [outputSelection, setOutputSelection] = useState({ pool: "", page: 1 }),
    [selected, setSelected] = useState("");
  const [filter, setFilter] = useState(""),
    [assetInput, setAssetInput] = useState("lovelace"),
    [indexAsset, setIndexAsset] = useState(GRAVITY_ADA_INDEXER_ASSET),
    [assetError, setAssetError] = useState("");
  const pools = useQuery({
    queryKey: ["dingo", "markets", "gravity", "pools", indexAsset, page],
    queryFn: ({ signal }) => readGravityPools(indexAsset, page, signal),
    staleTime: 60000,
    retry: false,
  });
  const pool =
    pools.data?.pools.find((p) => p.id === selected) ?? pools.data?.pools[0];
  const poolScope = pool ? `${pool.id}:${pool.poolHash}` : "";
  const outputPage =
    outputSelection.pool === poolScope ? outputSelection.page : 1;
  const setOutputPage = (next: number | ((page: number) => number)) =>
    setOutputSelection({
      pool: poolScope,
      page: typeof next === "function" ? next(outputPage) : next,
    });
  const composition = useQuery({
    queryKey: [
      "dingo",
      "markets",
      "gravity",
      "composition",
      pool?.id,
      pool?.poolHash,
      outputPage,
    ],
    enabled: !!pool,
    queryFn: ({ signal }) =>
      readGravityPoolComposition(pool!, outputPage, signal),
    staleTime: 30000,
    retry: false,
  });
  useEffect(
    () =>
      useTipStore.subscribe((next, previous) => {
        if (
          next.revision !== previous.revision &&
          next.lastAction !== "apply"
        ) {
          setPage(1);
          setOutputSelection({ pool: "", page: 1 });
          setSelected("");
        }
      }),
    [],
  );
  const outputs = useMemo(
    () =>
      composition.data?.outputs.map((row) => {
        const ada = row.amount.find((a) => a.unit === "lovelace");
        const tokens = new Map(
          row.amount
            .filter((a) => a.unit !== "lovelace")
            .map((a) => [Core.AssetId(a.unit), BigInt(a.quantity)]),
        );
        return new Core.TransactionUnspentOutput(
          new Core.TransactionInput(
            Core.TransactionId(row.tx_hash),
            BigInt(row.output_index),
          ),
          new Core.TransactionOutput(
            Core.Address.fromBech32(row.address),
            new Core.Value(BigInt(ada?.quantity ?? "0"), tokens),
          ),
        );
      }) ?? [],
    [composition.data],
  );
  const shown = (pools.data?.pools ?? []).filter((p) =>
    `${marketAssetName(p.assetA)} ${marketAssetName(p.assetB)} ${p.assetA} ${p.assetB} ${p.id}`
      .toLowerCase()
      .includes(filter.toLowerCase().trim()),
  );
  const held = (unit: string) =>
    composition.data?.amounts.find((row) => row.asset === unit)?.quantity;
  function selectAsset() {
    try {
      if (
        assetInput !== "lovelace" &&
        !/^[a-f\d]{56}(?:[a-f\d]{2}){0,32}$/.test(assetInput)
      )
        throw new Error("Enter lovelace or a complete native asset ID.");
      setIndexAsset(
        GRAVITY_INDEXER_POLICY +
          Core.blake2b_256(
            Core.HexBlob(assetInput === "lovelace" ? "" : assetInput),
          ),
      );
      setPage(1);
      setOutputPage(1);
      setSelected("");
      setAssetError("");
    } catch (error) {
      setAssetError(
        error instanceof Error ? error.message : "Choose a valid asset.",
      );
    }
  }
  return (
    <div className="markets-page">
      <section className="market-hero">
        <div>
          <span className="eyebrow">Gravity · Preprod · pool monitor</span>
          <h1>
            A pool is
            <br />
            <em>a living system.</em>
          </h1>
          <p>
            Follow on-chain asset-index records to the contracts that hold the
            tokens. Inspect the individual outputs and their assets, directly
            from Dingo.
          </p>
          <div className="market-source">
            <span>Dingo-only discovery</span>
            <span>On-chain asset index</span>
            <a
              href="https://preprod.gravitydex.app"
              target="_blank"
              rel="noreferrer"
            >
              Gravity protocol website ↗
            </a>
          </div>
        </div>
        <figure className="market-illustration">
          <svg
            viewBox="0 0 420 230"
            role="img"
            aria-label="Gravity contract map: pool oracle connects token pool, limit orders, deposits and withdrawals"
          >
            <path
              d="M210 60V115M210 115L65 180M210 115L210 180M210 115L355 180"
              stroke="#66dfc2"
              strokeWidth="2"
              fill="none"
            />
            {[
              [210, 40, "Pool oracle"],
              [210, 115, "Token pool"],
              [65, 190, "Limit orders"],
              [210, 190, "Deposits"],
              [355, 190, "Withdrawals"],
            ].map(([x, y, label]) => (
              <g key={label}>
                <rect
                  x={Number(x) - 58}
                  y={Number(y) - 20}
                  width="116"
                  height="40"
                  rx="12"
                  fill={label === "Token pool" ? "#265b51" : "#3c3158"}
                  stroke="#8d8bba"
                />
                <text x={x} y={Number(y) + 4} textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}
          </svg>
          <figcaption>
            Contract identities are decoded from each indexed oracle.
          </figcaption>
        </figure>
      </section>
      <div className="market-catalog">
        <div className="market-toolbar">
          <div>
            <span className="eyebrow">Choose an asset index</span>
            <h2>
              {indexAsset === GRAVITY_ADA_INDEXER_ASSET
                ? "ADA pairs"
                : "Selected asset pairs"}
            </h2>
          </div>
        </div>
        <div className="market-index-input">
          <input
            className="market-search"
            aria-label="Gravity asset to explore"
            value={assetInput}
            onChange={(e) => setAssetInput(e.target.value.trim())}
            placeholder="lovelace or native asset ID"
          />
          <button className="experience-primary" onClick={selectAsset}>
            Show pairs
          </button>
        </div>
        {assetError && (
          <p role="alert" className="tool-error">
            {assetError}
          </p>
        )}
      </div>
      {pools.isPending || pools.error ? (
        <MarketLoading error={pools.error} retry={() => void pools.refetch()} />
      ) : (
        <>
          <div className="market-stats">
            <div>
              <span className="eyebrow">Directory page</span>
              <strong>{pools.data?.pools.length} pools</strong>
              <small>Matched to this asset index</small>
            </div>
            <div>
              <span className="eyebrow">Selected type</span>
              <strong>{pool ? poolTypes[pool.poolType] : "No pool"}</strong>
              <small>Decoded from the pool oracle</small>
            </div>
            <div>
              <span className="eyebrow">Loaded outputs</span>
              <strong>{composition.data?.utxoCount ?? "…"}</strong>
              <small>Actual token-holding contract, not oracle buffer</small>
            </div>
          </div>
          {pool && (
            <section className="market-catalog">
              <div className="market-toolbar">
                <div>
                  <span className="eyebrow">Selected pool</span>
                  <h2>
                    <MarketAsset unit={pool.assetA} /> /{" "}
                    <MarketAsset unit={pool.assetB} />
                  </h2>
                </div>
                <button onClick={() => void composition.refetch()}>
                  Refresh outputs ↻
                </button>
              </div>
              {composition.isPending || composition.error ? (
                <MarketLoading
                  error={composition.error}
                  retry={() => void composition.refetch()}
                />
              ) : (
                <>
                  <UtxoConstellation outputs={outputs} inspectOnly />
                  <div className="market-terms">
                    <div>
                      <small>
                        Loaded {marketAssetName(pool.assetA)} holdings
                      </small>
                      <strong>
                        {marketAmount(held(pool.assetA) ?? 0n, pool.assetA)}
                      </strong>
                    </div>
                    <div>
                      <small>
                        Loaded {marketAssetName(pool.assetB)} holdings
                      </small>
                      <strong>
                        {marketAmount(held(pool.assetB) ?? 0n, pool.assetB)}
                      </strong>
                    </div>
                  </div>
                  <p className="market-help">
                    These are assets in the loaded contract outputs, including
                    any locked or in-flight amounts. They are not a swap quote
                    or a claim of immediately available liquidity.
                  </p>
                </>
              )}
              <div className="market-pagination">
                <button
                  disabled={outputPage === 1}
                  onClick={() => setOutputPage((p) => p - 1)}
                >
                  ← Previous outputs
                </button>
                <span>Output page {outputPage}</span>
                <button
                  disabled={!composition.data?.partial || !!composition.error}
                  onClick={() => setOutputPage((p) => p + 1)}
                >
                  Next outputs →
                </button>
              </div>{" "}
              <details className="market-contracts">
                <summary>Contract identities and oracle</summary>
                {[
                  { name: "Pool oracle", address: pool.address },
                  { name: "Token pool", address: pool.poolAddress },
                ].map((row) => (
                  <div key={row.name}>
                    <strong>{row.name}</strong>
                    <Link to={`/explorer/address/${row.address}`}>
                      <code>{row.address}</code>
                    </Link>
                    <CopyButton value={row.address} label={row.name} />
                  </div>
                ))}
                <Link to={`/explorer/tx/${pool.txHash}`}>
                  View oracle transaction ↗
                </Link>
              </details>
            </section>
          )}
          <section className="market-catalog">
            <div className="market-toolbar">
              <div>
                <span className="eyebrow">On-chain pool directory</span>
                <h2>Follow another pool</h2>
              </div>
              <button onClick={() => void pools.refetch()}>Refresh ↻</button>
            </div>
            <input
              className="market-search"
              type="search"
              aria-label="Filter Gravity pools"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter loaded pairs by asset, policy or pool…"
            />
            <div className="market-grid">
              {shown.map((p) => (
                <button
                  key={p.id}
                  className={`market-card${pool?.id === p.id ? " selected" : ""}`}
                  aria-pressed={pool?.id === p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setOutputPage(1);
                  }}
                >
                  <span className="market-pair">
                    <MarketAsset unit={p.assetA} /> /{" "}
                    <MarketAsset unit={p.assetB} />
                  </span>
                  <strong>{poolTypes[p.poolType]}</strong>
                  <small>Oracle {p.id.slice(0, 12)}…</small>
                  <small>Token pool {p.poolHash.slice(0, 12)}…</small>
                </button>
              ))}
            </div>
            {!shown.length && (
              <div className="market-empty">
                <strong>No matching indexed pools</strong>
                <p>Choose another asset or change the loaded-page filter.</p>
              </div>
            )}
            {!!pools.data?.errors.length && (
              <p className="market-help" role="status">
                {pools.data.errors.length} unsupported or unavailable pool
                records were excluded.
              </p>
            )}
          </section>
        </>
      )}
      <div className="market-pagination">
        <button
          disabled={page === 1}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected("");
            setOutputPage(1);
          }}
        >
          ← Previous pairs
        </button>
        <span>Page {page}</span>
        <button
          disabled={!pools.data?.partial || !!pools.error}
          onClick={() => {
            setPage((p) => p + 1);
            setSelected("");
            setOutputPage(1);
          }}
        >
          Next pairs →
        </button>
      </div>{" "}
    </div>
  );
}
