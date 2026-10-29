import { useCompactVisual } from "../../lib/chain/useCompactVisual";
import { useId, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { treemap } from "../../lib/chain/geometry";
import { formatAda, shortenHash } from "../../lib/format";
const kinds = [
  { id: "transfer", label: "Transfers / other", color: "#43d9b6" },
  { id: "stake", label: "Stake / certificates", color: "#69b8f2" },
  { id: "governance", label: "Governance", color: "#b4a3ff" },
  { id: "mint", label: "Mint / burn", color: "#f6c86d" },
  { id: "scripts", label: "Script execution", color: "#ee91cb" },
  { id: "failed", label: "Failed scripts", color: "#fc968b" },
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
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(row.cbor));
  if (tx.getId() !== row.tx_hash)
    throw new Error("Transaction hash does not match CBOR.");
  const body = tx.body();
  const certs = body.certs()?.values() ?? [];
  const governance = Boolean(
    body.votingProcedures()?.getVoters().length ||
    body.proposalProcedures()?.size() ||
    certs.some((c) =>
      /DRep|Committee|VoteDelegation|DelegateRepresentative/i.test(
        c.toCore().__typename,
      ),
    ),
  );
  const kind = !tx.isValid()
    ? "failed"
    : (tx.witnessSet().redeemers()?.values().length ?? 0) > 0
      ? "scripts"
      : body.mint()?.size
        ? "mint"
        : governance
          ? "governance"
          : certs.length
            ? "stake"
            : "transfer";
  return {
    id: row.tx_hash,
    weight: BigInt(row.cbor.length / 2),
    bytes: row.cbor.length / 2,
    fee: body.fee(),
    kind,
  };
}
export function BlockMosaic({ hash, total }: { hash: string; total: number }) {
  return <Mosaic key={hash} hash={hash} total={total} />;
}
function Mosaic({ hash, total }: { hash: string; total: number }) {
  const compact = useCompactVisual();
  const mapWidth = compact ? 700 : 1000,
    mapHeight = compact ? 700 : 540;
  const [open, setOpen] = useState(false),
    [filter, setFilter] = useState("all");
  const client = useQueryClient();
  const uid = useId();
  const query = useInfiniteQuery({
    queryKey: ["dingo", "block", hash, "mosaic"],
    enabled: open,
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
  return (
    <section className="chain-visual block-mosaic">
      <header className="chain-heading">
        <div>
          <span className="eyebrow">A block, under the microscope</span>
          <h2>Every transaction has a shape.</h2>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} disabled={total === 0}>
            Explore {total.toLocaleString()} transactions
          </button>
        )}
      </header>
      {!open ? (
        <div className="mosaic-teaser" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <nav
            className="chain-legend"
            aria-label="Transaction activity filter"
          >
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All · {records.length}
            </button>
            {kinds.map((k) => (
              <button
                key={k.id}
                aria-pressed={filter === k.id}
                onClick={() => setFilter(k.id)}
              >
                <i style={{ background: k.color }} />
                {k.label} · {records.filter((r) => r.kind === k.id).length}
              </button>
            ))}
          </nav>
          <div className="mosaic-caption">
            <strong>
              {filtered.length} transactions · {(bytes / 1024).toFixed(1)} KiB ·{" "}
              {formatAda(fees)} fees
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
          {tiles.length > 0 ? (
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
                    aria-label={`${t.id}, ${t.bytes} bytes, ${t.kind}, ${formatAda(t.fee)} fee`}
                  >
                    <rect
                      x={t.x + 2}
                      y={t.y + 2}
                      width={Math.max(0, t.width - 4)}
                      height={Math.max(0, t.height - 4)}
                      rx={Math.min(12, t.width / 10, t.height / 10)}
                      fill={color}
                      fillOpacity=".2"
                      stroke={color}
                      strokeOpacity=".65"
                    />
                    <title>
                      {t.id} · {t.bytes} bytes · {t.kind} · {formatAda(t.fee)}
                    </title>
                    {t.width > 115 && t.height > 65 && (
                      <>
                        <text
                          x={t.x + 16}
                          y={t.y + 30}
                          fill={color}
                          fontSize="19"
                        >
                          {t.bytes.toLocaleString()} B
                        </text>
                        <text
                          x={t.x + 16}
                          y={t.y + 54}
                          fill="#d4e2e9"
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
          <details className="chain-records">
            <summary>Accessible transaction list</summary>
            {filtered.map((t) => (
              <Link key={t.id} to={`/explorer/tx/${t.id}`}>
                <code>{t.id}</code>
                <span>
                  {t.kind} · {t.bytes} B · {formatAda(t.fee)}
                </span>
              </Link>
            ))}
          </details>
        </>
      )}
      <p className="chain-footnote">
        Tile area represents serialized transaction bytes. Mixed activity uses
        this priority: failed scripts, script execution, mint/burn, governance,
        stake/certificates, transfer. Transaction bytes exclude the block
        header.
      </p>
    </section>
  );
}
