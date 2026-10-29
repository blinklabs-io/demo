import { useCompactVisual } from "../../lib/chain/useCompactVisual";
import { useId, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { treemap, fraction, visualColors } from "../../lib/chain/geometry";
import { shortenHash } from "../../lib/format";
interface Holder {
  address: string;
  quantity: string;
}
interface MintEvent {
  tx_hash: string;
  action: string;
  amount: string;
}
export function AssetDistribution({
  assetId,
  supply,
}: {
  assetId: string;
  supply: bigint;
}) {
  return <Distribution key={assetId} assetId={assetId} supply={supply} />;
}
function Distribution({
  assetId,
  supply,
}: {
  assetId: string;
  supply: bigint;
}) {
  const compact = useCompactVisual();
  const mapWidth = compact ? 600 : 1000,
    mapHeight = compact ? 600 : 480;
  const uid = useId(),
    [history, setHistory] = useState(false);
  const holders = useInfiniteQuery({
    queryKey: ["dingo", "asset", assetId, "holder-map"],
    initialPageParam: 1,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<Holder[]>(
        `/api/v0/assets/${assetId}/addresses?page=${pageParam}&count=100`,
        { signal },
      ),
    getNextPageParam: (last, pages) =>
      last.length === 100 ? pages.length + 1 : undefined,
  });
  const events = useInfiniteQuery({
    queryKey: ["dingo", "asset", assetId, "mint-map"],
    enabled: history,
    initialPageParam: 1,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<MintEvent[]>(
        `/api/v0/assets/${assetId}/history?page=${pageParam}&count=100&order=desc`,
        { signal },
      ),
    getNextPageParam: (last, pages) =>
      last.length === 100 ? pages.length + 1 : undefined,
  });
  const rows = [
    ...new Map(
      (holders.data?.pages.flat() ?? []).map((h) => [h.address, h]),
    ).values(),
  ].sort((a, b) =>
    BigInt(a.quantity) > BigInt(b.quantity)
      ? -1
      : BigInt(a.quantity) < BigInt(b.quantity)
        ? 1
        : a.address.localeCompare(b.address),
  );
  const loaded = rows.reduce((n, h) => n + BigInt(h.quantity), 0n),
    remaining = supply - loaded;
  const entries = rows.slice(0, 24).map((h, i) => ({
    id: h.address,
    weight: BigInt(h.quantity),
    label: shortenHash(h.address, 5),
    color: visualColors[i % visualColors.length],
    href: `/explorer/address/${h.address}`,
  }));
  if (rows.length > 24)
    entries.push({
      id: "other",
      weight: rows.slice(24).reduce((n, h) => n + BigInt(h.quantity), 0n),
      label: `${rows.length - 24} other loaded addresses`,
      color: "#7595ae",
      href: "",
    });
  if (remaining > 0n)
    entries.push({
      id: "unloaded",
      weight: remaining,
      label: "Supply not mapped in loaded addresses",
      color: "#42576c",
      href: "",
    });
  const tiles = treemap(entries, mapWidth, mapHeight),
    mintRows = events.data?.pages.flat() ?? [],
    maximum = mintRows.reduce(
      (n, e) => (BigInt(e.amount) > n ? BigInt(e.amount) : n),
      1n,
    );
  return (
    <section className="chain-visual asset-landscape">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">Where the supply lives</span>
          <h2>The ownership landscape.</h2>
        </div>
        <div className="chain-stat">
          <strong>{(fraction(loaded, supply) * 100).toFixed(1)}%</strong>
          <span>of issued supply mapped</span>
        </div>
      </header>
      {rows.length > 0 && supply > 0n && (
        <div className="concentration-strip">
          <div>
            <span>Largest loaded address / supply</span>
            <strong>
              {(fraction(BigInt(rows[0].quantity), supply) * 100).toFixed(2)}%
            </strong>
          </div>
          <div>
            <span>Five largest loaded addresses / supply</span>
            <strong>
              {(
                fraction(
                  rows.slice(0, 5).reduce((n, h) => n + BigInt(h.quantity), 0n),
                  supply,
                ) * 100
              ).toFixed(2)}
              %
            </strong>
          </div>
          <p>
            {holders.hasNextPage || remaining > 0n
              ? "Lower bounds on the shares held by the largest addresses across the full supply."
              : "All returned holder addresses are mapped."}
          </p>
        </div>
      )}
      {holders.isPending && <p role="status">Mapping holder addresses…</p>}
      {holders.error && (
        <p role="alert" className="chain-error">
          {holders.error.message}{" "}
          <button
            onClick={() =>
              void (holders.hasNextPage
                ? holders.fetchNextPage()
                : holders.refetch())
            }
          >
            Retry holders
          </button>
        </p>
      )}
      {loaded > supply && (
        <p className="chain-error">
          Loaded address quantities exceed the reported supply. Tile areas show
          loaded quantities; coverage is inconsistent.
        </p>
      )}
      {tiles.length > 0 && (
        <svg
          className="mosaic-svg asset-map"
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="img"
          aria-labelledby={`${uid}-title`}
        >
          <title id={`${uid}-title`}>
            Asset supply by loaded address, with unmapped supply shown
            separately. Addresses are not necessarily separate wallets.
          </title>
          {tiles.map((t) => {
            const tile = (
              <>
                <rect
                  x={t.x + 2}
                  y={t.y + 2}
                  width={Math.max(0, t.width - 4)}
                  height={Math.max(0, t.height - 4)}
                  rx="7"
                  fill={t.color}
                  fillOpacity={t.id === "unloaded" ? ".17" : ".25"}
                  stroke={t.color}
                />
                <title>
                  {t.label}: {t.weight.toLocaleString()} raw units ·{" "}
                  {(fraction(t.weight, supply) * 100).toFixed(3)}% of supply
                </title>
                {t.width > 170 && t.height > 72 && (
                  <>
                    <text
                      x={t.x + 16}
                      y={t.y + 30}
                      fill="#ecfff9"
                      fontSize="22"
                    >
                      {(fraction(t.weight, supply) * 100).toFixed(2)}%
                    </text>
                    <text
                      x={t.x + 16}
                      y={t.y + 54}
                      fill="#b7cbd5"
                      fontSize="12"
                    >
                      {t.label}
                    </text>
                  </>
                )}
              </>
            );
            return t.href ? (
              <Link
                key={t.id}
                to={t.href}
                aria-label={`${t.id}: ${t.weight} raw units`}
              >
                {tile}
              </Link>
            ) : (
              <g key={t.id}>{tile}</g>
            );
          })}
        </svg>
      )}
      {!holders.isPending && rows.length === 0 && !holders.error && (
        <p className="chain-empty">No holder addresses returned.</p>
      )}
      {holders.hasNextPage && (
        <button
          disabled={holders.isFetching}
          onClick={() => void holders.fetchNextPage()}
        >
          {holders.isFetching ? "Mapping…" : "Map next 100 addresses"}
        </button>
      )}
      <details className="chain-records">
        <summary>
          {rows.length} loaded holder addresses · {loaded.toLocaleString()} raw
          units
        </summary>
        {rows.map((h) => (
          <Link key={h.address} to={`/explorer/address/${h.address}`}>
            <code>{h.address}</code>
            <strong>{BigInt(h.quantity).toLocaleString()} raw units</strong>
          </Link>
        ))}
      </details>
      <p className="chain-footnote">
        Tile area is raw token quantity. Addresses can belong to the same
        wallet. The API does not guarantee largest-first order: this map ranks
        only the loaded addresses. Gray area is supply not yet mapped, not one
        holder.
      </p>
      <div className="mint-heading">
        <div>
          <span className="eyebrow">Supply in motion</span>
          <h3>Created. Destroyed. Recorded.</h3>
        </div>
        {!history && (
          <button onClick={() => setHistory(true)}>
            Explore mint &amp; burn history
          </button>
        )}
      </div>
      {history && (
        <>
          {events.isPending && <p role="status">Reading supply events…</p>}
          {events.error && (
            <p role="alert" className="chain-error">
              {events.error.message}{" "}
              <button
                onClick={() =>
                  void (events.hasNextPage
                    ? events.fetchNextPage()
                    : events.refetch())
                }
              >
                Retry history
              </button>
            </p>
          )}
          {mintRows.length > 0 ? (
            <>
              <div
                className="mint-bars"
                aria-label="Mint and burn event sequence, newest first"
              >
                {mintRows.map((e, i) => {
                  const minted = e.action === "minted",
                    burned = e.action === "burned";
                  return (
                    <Link
                      key={`${e.tx_hash}:${e.action}:${i}`}
                      to={`/explorer/tx/${e.tx_hash}`}
                      className={
                        minted
                          ? "mint-positive"
                          : burned
                            ? "mint-negative"
                            : "mint-unknown"
                      }
                      aria-label={`${e.action}: ${e.amount} raw units, transaction ${e.tx_hash}`}
                    >
                      <span
                        className="mint-bar"
                        style={{
                          height: `${Math.max(2, 90 * fraction(BigInt(e.amount), maximum))}px`,
                        }}
                      />
                      <span className="mint-event-label">
                        {minted ? "+" : burned ? "−" : "?"}
                        {BigInt(e.amount).toLocaleString()}
                      </span>
                      <span className="mint-action">{e.action}</span>
                    </Link>
                  );
                })}
              </div>
              <p className="chain-footnote">
                Newest → oldest events, evenly spaced. This is event order, not
                a time axis. Values are raw token units.
              </p>
            </>
          ) : (
            !events.isPending &&
            !events.error && (
              <p className="chain-empty">No mint or burn events returned.</p>
            )
          )}
          {events.hasNextPage && (
            <button
              disabled={events.isFetching}
              onClick={() => void events.fetchNextPage()}
            >
              {events.isFetching ? "Loading…" : "Load next 100 events"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
