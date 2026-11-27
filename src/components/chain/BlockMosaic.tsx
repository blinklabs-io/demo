import { transactionActivity } from "../../lib/chain/transactionActivity";
import { useCompactVisual } from "../../lib/chain/useCompactVisual";
import { useId, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { Link } from "../NetworkLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { treemap } from "../../lib/chain/geometry";
import { formatNativeCoin, shortenHash } from "../../lib/format";
import { decodeLeiosTransaction } from "../../lib/explorer/leiosTransactions";
const kinds = [
  { id: "transfer", label: "Transfers / other", color: "var(--accent)" },
  { id: "stake", label: "Stake / certificates", color: "var(--viz-1)" },
  { id: "governance", label: "Governance", color: "var(--viz-4)" },
  { id: "mint", label: "Mint / burn", color: "var(--viz-2)" },
  { id: "scripts", label: "Script execution", color: "var(--viz-5)" },
  { id: "withdrawal", label: "Reward withdrawals", color: "var(--viz-3)" },
  { id: "failed", label: "Failed scripts", color: "var(--danger)" },
];
interface Raw {
  tx_hash: string;
  cbor: string;
}
interface Record {
  id: string;
  weight: bigint;
  bytes: number;
  fee: bigint;
  kind: string;
}
function decode(row: Raw): Record {
  if (!/^[a-f0-9]+$/i.test(row.cbor) || row.cbor.length % 2)
    throw new Error("Invalid transaction CBOR.");
  const envelope = new Core.CborReader(Core.HexBlob(row.cbor));
  const envelopeLength = envelope.readStartArray();
  let txCbor = row.cbor;
  if (envelopeLength === 4) {
    const body = envelope.readEncodedValue();
    const witnesses = envelope.readEncodedValue();
    const thirdState = envelope.peekState();
    const third = envelope.readEncodedValue();
    const fourth = envelope.readEncodedValue();
    envelope.readEndArray();
    if (envelope.getBytesRemaining()) throw new Error("Trailing transaction data.");
    if (thirdState !== Core.CborReaderState.Boolean) {
      const dijkstra = decodeLeiosTransaction(row);
      txCbor = `84${Core.toHex(body)}${Core.toHex(witnesses)}${Core.toHex(fourth)}${Core.toHex(third)}`;
      const tx = Core.Transaction.fromCbor(Core.TxCBOR(txCbor));
      if (tx.body().fee() !== dijkstra.fee || tx.isValid() !== dijkstra.valid)
        throw new Error("Dijkstra transaction fields do not match its envelope.");
      return {
        id: row.tx_hash,
        weight: BigInt(row.cbor.length / 2),
        bytes: row.cbor.length / 2,
        fee: dijkstra.fee,
        kind: transactionActivity(tx),
      };
    }
  }
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(txCbor));
  if (tx.getId() !== row.tx_hash)
    throw new Error("Transaction hash does not match CBOR.");
  const body = tx.body();
  const kind = transactionActivity(tx);
  return {
    id: row.tx_hash,
    weight: BigInt(row.cbor.length / 2),
    bytes: row.cbor.length / 2,
    fee: body.fee(),
    kind,
  };
}
interface MosaicProps {
  hash: string;
  total: number;
}
export function BlockMosaic({ hash, total }: MosaicProps) {
  return <Mosaic key={hash} hash={hash} total={total} />;
}
function Mosaic({ hash, total }: MosaicProps) {
  const compact = useCompactVisual();
  const mapWidth = compact ? 700 : 1000,
    mapHeight = compact ? 700 : 540;
  // A treemap of two or three tiles says less than the rows themselves.
  const few = total <= 4;
  const [filter, setFilter] = useState("all");
  const client = useQueryClient();
  const uid = useId();
  const query = useInfiniteQuery({
    queryKey: ["dingo", "block", hash, "mosaic"],
    enabled: total > 0,
    initialPageParam: 1,
    retry: false,
    staleTime: 300000,
    queryFn: async ({ pageParam, signal }) => {
      const raw = await blockfrostFetch<Raw[]>(
        `/api/v0/blocks/${hash}/txs/cbor?page=${pageParam}&count=40&order=asc`,
        { signal },
      );
      const records: Record[] = [];
      const errors: { id: string; message: string }[] = [];
      for (const row of raw) {
        try {
          records.push(decode(row));
          client.setQueryData(["dingo", "tx", row.tx_hash, "cbor"], {
            cbor: row.cbor,
          });
        } catch (e) {
          errors.push({
            id: row.tx_hash,
            message:
              e instanceof Error ? e.message : "Cannot decode transaction.",
          });
        }
      }
      return { records, errors, count: raw.length };
    },
    getNextPageParam: (last, pages) =>
      last.count === 40 && pages.reduce((n, p) => n + p.count, 0) < total
        ? pages.length + 1
        : undefined,
  });
  const records = [
    ...new Map(
      (query.data?.pages.flatMap((p) => p.records) ?? []).map((r) => [r.id, r]),
    ).values(),
  ];
  const skipped = query.data?.pages.flatMap((p) => p.errors) ?? [];
  const loaded = query.data?.pages.reduce((n, p) => n + p.count, 0) ?? 0;
  const filtered = records.filter((r) => filter === "all" || r.kind === filter);
  const tiles = treemap(
    [...filtered].sort((a, b) => b.bytes - a.bytes),
    mapWidth,
    mapHeight,
  );
  const bytes = filtered.reduce((n, r) => n + r.bytes, 0);
  const fees = filtered.reduce((n, r) => n + r.fee, 0n);
  const present = kinds
    .map((k) => ({ ...k, count: records.filter((r) => r.kind === k.id).length }))
    .filter((k) => k.count > 0 || k.id === filter);
  return (
    <section className="chain-visual block-mosaic">
      <header className="chain-heading">
        <h2>Transactions in this block</h2>
      </header>
      {total === 0 ? (
        <div className="chain-empty">
          <strong>This block was empty.</strong>
          <p>There are no transactions to map.</p>
        </div>
      ) : (
        <>
          {!few && <nav
            className="chain-legend"
            aria-label="Transaction activity filter"
          >
            {present.length > 1 && (
              <button
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All {records.length}
              </button>
            )}
            {present.map((k) => (
              <button
                key={k.id}
                aria-pressed={filter === k.id}
                onClick={() => setFilter(k.id)}
              >
                <i style={{ background: k.color }} />
                {k.label} {k.count}
              </button>
            ))}
          </nav>}
          <div className="mosaic-caption">
            <strong>
              {filtered.length} {filtered.length === 1 ? "transaction" : "transactions"} ·{" "}
              {(bytes / 1024).toFixed(1)} KiB ·{" "}
              {formatNativeCoin(fees)} fees
            </strong>
            <span>
              {loaded} of {total} records loaded
              {skipped.length ? ` · ${skipped.length} undecodable` : ""}
            </span>
          </div>
          {query.isPending && (
            <p role="status">Reading this block’s transaction bytes…</p>
          )}
          {query.error && (
            <div className="chain-error" role="alert">
              {query.error.message}
              <button
                onClick={() =>
                  void (query.hasNextPage
                    ? query.fetchNextPage()
                    : query.refetch())
                }
              >
                Retry mosaic
              </button>
            </div>
          )}
          {few ? (
            <ul className="mosaic-strip">
              {filtered.map((t) => {
                const kind = kinds.find((k) => k.id === t.kind)!;
                return (
                  <li
                    key={t.id}
                    style={{ flexGrow: t.bytes, ["--kind" as string]: kind.color }}
                  >
                    <Link
                      to={`/explorer/tx/${t.id}`}
                      aria-label={`${t.id}, ${t.bytes} bytes, ${kind.label}, ${formatNativeCoin(t.fee)} fee`}
                    >
                      <span className="mosaic-tile-kind">
                        <i />
                        {kind.label}
                      </span>
                      <strong>{t.bytes.toLocaleString()} B</strong>
                      <span>{formatNativeCoin(t.fee)} fee</span>
                      <code>{shortenHash(t.id, 8)}</code>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : tiles.length > 0 ? (
            <svg
              className="mosaic-svg"
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              role="img"
              aria-labelledby={`${uid}-title`}
            >
              <title id={`${uid}-title`}>
                Transactions sized by serialized bytes and colored by their
                activity. Click a tile to inspect the transaction.
              </title>
              {tiles.map((t) => {
                const color = kinds.find((k) => k.id === t.kind)!.color;
                return (
                  <Link
                    key={t.id}
                    to={`/explorer/tx/${t.id}`}
                    aria-label={`${t.id}, ${t.bytes} bytes, ${t.kind}, ${formatNativeCoin(t.fee)} fee`}
                  >
                    <rect
                      x={t.x + 2}
                      y={t.y + 2}
                      width={Math.max(0, t.width - 4)}
                      height={Math.max(0, t.height - 4)}
                      rx={Math.min(8, t.width / 10, t.height / 10)}
                      style={{ fill: color, stroke: color }}
                      fillOpacity=".16"
                      strokeOpacity=".6"
                    />
                    <title>
                      {t.id} · {t.bytes} bytes · {t.kind} · {formatNativeCoin(t.fee)}
                    </title>
                    {t.width > 115 && t.height > 65 && (
                      <>
                        <text
                          x={t.x + 16}
                          y={t.y + 30}
                          style={{ fill: color }}
                          fontSize="19"
                        >
                          {t.bytes.toLocaleString()} B
                        </text>
                        <text
                          x={t.x + 16}
                          y={t.y + 54}
                          style={{ fill: "var(--text-2)" }}
                          fontSize="14"
                        >
                          {shortenHash(t.id, 5)}
                        </text>
                      </>
                    )}
                  </Link>
                );
              })}
            </svg>
          ) : (
            !query.isPending &&
            !query.error && (
              <p className="chain-empty">
                No loaded transactions match this activity filter.
              </p>
            )
          )}
          {query.hasNextPage && (
            <button
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetching ? "Loading…" : "Load next 40 transactions"}
            </button>
          )}
          {loaded < total &&
            !query.hasNextPage &&
            !query.isPending &&
            !query.error && (
              <p className="chain-error">
                Dingo returned fewer records than the block’s transaction count.
              </p>
            )}
          {skipped.length > 0 && (
            <details>
              <summary>Undecodable records</summary>
              {skipped.map((e, i) => (
                <p key={`${e.id}:${i}`}>
                  <Link to={`/explorer/tx/${e.id}`}>{shortenHash(e.id)}</Link> ·{" "}
                  {e.message}
                </p>
              ))}
            </details>
          )}
          {!few && <details className="chain-records">
            <summary>Accessible transaction list</summary>
            {filtered.map((t) => (
              <Link key={t.id} to={`/explorer/tx/${t.id}`}>
                <code>{t.id}</code>
                <span>
                  {t.kind} · {t.bytes} B · {formatNativeCoin(t.fee)}
                </span>
              </Link>
            ))}
          </details>}
        </>
      )}
      <p className="chain-footnote">
        {few ? "Tile width" : "Tile area"} is serialized transaction bytes. A transaction
        with several kinds of activity is labelled by the first that applies:
        failed scripts, governance, mint/burn, script execution,
        stake/certificates, reward withdrawals, transfer.
      </p>
    </section>
  );
}
