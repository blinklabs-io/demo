import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { blockBytesQuery } from "../../lib/dingo/blockHeader";
import { decodeLeiosBlock } from "../../lib/dingo/leios";
import { LEIOS_TRANSACTION_PAGE_SIZE, readLeiosTransactionPage } from "../../lib/explorer/leiosTransactions";
import type { BlockSummary } from "../../lib/explorer/recentBlocks";
import { formatAda } from "../../lib/format";
import { HashLink } from "./HashLink";
import { CopyButton } from "./CopyButton";
import { Link } from "../NetworkLink";
import { Metric } from "./Visuals";
import "./leios.css";

export function LeiosTransactions({ block }: { block: BlockSummary }) {
  if (DINGO_NETWORK.id !== "musashi") return null;
  return <Transactions key={block.hash} block={block} />;
}

function Transactions({ block }: { block: BlockSummary }) {
  const [readingAll, setReadingAll] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const client = useQueryClient();
  const select = useCallback((bytes: Uint8Array) => ({ observation: decodeLeiosBlock(bytes, block), bytes: bytes.length }), [block]);
  const native = useQuery({ ...blockBytesQuery(block.hash, block.slot), select });
  const parent = useQuery({
    queryKey: ["dingo", "block", block.hash, "certified-announcement"],
    enabled: native.data?.observation?.certified === true,
    queryFn: async ({ signal }) => {
      const record = await blockfrostFetch<BlockSummary>(`/api/v0/blocks/${block.previous_block}`, { signal });
      if (record.hash !== block.previous_block || record.height !== block.height - 1)
        throw new Error("The announcing block does not match the certifying block’s parent.");
      const bytes = await client.fetchQuery(blockBytesQuery(record.hash, record.slot));
      const observation = decodeLeiosBlock(bytes, record);
      if (!observation?.announcement) throw new Error("The certifying block’s parent has no Leios announcement.");
      return { block: record.hash, ...observation.announcement };
    },
    staleTime: Infinity,
    retry: false,
  });
  const transactions = useInfiniteQuery({
    queryKey: ["dingo", "block", block.hash, "leios-transactions"],
    enabled: native.isSuccess && block.tx_count > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => readLeiosTransactionPage(block.hash, pageParam, signal),
    getNextPageParam: (last, pages) => last.count === LEIOS_TRANSACTION_PAGE_SIZE && pages.reduce((sum, page) => sum + page.count, 0) < block.tx_count ? pages.length + 1 : undefined,
    staleTime: Infinity,
    retry: false,
  });
  const records = transactions.data?.pages.flatMap((page) => page.records) ?? [];
  const errors = transactions.data?.pages.flatMap((page) => page.errors) ?? [];
  const loaded = transactions.data?.pages.reduce((sum, page) => sum + page.count, 0) ?? 0;
  const complete = loaded === block.tx_count && errors.length === 0;
  const bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const certified = native.data?.observation?.certified === true;
  async function readAll() {
    setReadingAll(true);
    try {
      let result = transactions;
      while (mounted.current && result.hasNextPage) {
        result = await result.fetchNextPage();
        if (result.isError) break;
      }
    } finally { if (mounted.current) setReadingAll(false); }
  }
  return (
    <section className="leios-panel" aria-label="Leios block transactions">
      <header className="leios-heading">
        <div>
          <span className="eyebrow">{certified ? "Certified Endorser Block" : "Ranking-block body"}</span>
          <h2>{certified ? "The transactions behind the certificate." : "Transactions carried by this block."}</h2>
        </div>
      </header>
      {native.isLoading && <p role="status">Reading the ranking block…</p>}
      {native.error && <p role="alert">{native.error.message} <button type="button" onClick={() => void native.refetch()}>Retry native block</button></p>}
      
      {native.data && <>
        <div className="metric-grid">
          <Metric label="Ranking-block bytes" value={native.data.bytes.toLocaleString()} />
          <Metric label={certified ? "EB transactions" : "Ranking-body transactions"} value={block.tx_count.toLocaleString()} />
          <Metric label={complete ? "Transaction bytes" : "Loaded transaction bytes"} value={transactions.data || block.tx_count === 0 ? bytes.toLocaleString() : "—"} detail={`${records.length.toLocaleString()} decoded of ${block.tx_count.toLocaleString()} transactions`} />
          {certified && <Metric label="Announced EB manifest bytes" value={parent.data?.bytes.toLocaleString() ?? "—"} />}
        </div>
        {certified && <>
          {parent.isLoading && <p role="status">Resolving the certified EB from the previous ranking block…</p>}
          {parent.error && <p role="alert">{parent.error.message} <button type="button" onClick={() => void parent.refetch()}>Retry EB identity</button></p>}
          {parent.data && <div className="leios-announcement">
            <span>Certified EB hash · announced by <Link to={`/explorer/block/${parent.data.block}`}>the previous ranking block ↗</Link></span>
            <code>{parent.data.hash}</code><CopyButton value={parent.data.hash} label="certified endorser block hash" />
          </div>}
          <p className="leios-note">These transactions are confirmed by this ranking block’s certificate and are stored separately from its body. The certified EB was announced by the previous block. Its manifest lists transaction references; transaction bytes measure the full serialized transactions separately.</p>
        </>}
        {transactions.isFetching && <p role="status">Reading transaction sizes…</p>}
        {transactions.error && <p role="alert">{transactions.error.message} <button type="button" onClick={() => void (transactions.hasNextPage ? transactions.fetchNextPage() : transactions.refetch())}>Retry transactions</button></p>}
        {block.tx_count === 0 && <p>No transactions in this block.</p>}
        <ol className="activity-list leios-transaction-list">
          {records.map((record, index) => <li key={`${index}:${record.hash}`}>
            <span className="status-badge">{certified ? "EB TX" : "RB TX"}</span>
            <HashLink kind="tx" id={record.hash} />
            <span>{record.bytes.toLocaleString()} bytes</span>
            <span>{formatAda(record.fee)} fee</span>
            {!record.valid && <span className="status-badge">Failed scripts</span>}
          </li>)}
        </ol>
        {transactions.hasNextPage && <div className="market-actions">
          <button type="button" disabled={transactions.isFetching || readingAll} onClick={() => void transactions.fetchNextPage()}>Load next {LEIOS_TRANSACTION_PAGE_SIZE} transactions</button>
          <button type="button" disabled={transactions.isFetching || readingAll} onClick={() => void readAll()}>{readingAll ? "Reading all transaction sizes…" : "Read all transaction sizes"}</button>
        </div>}
        {!transactions.hasNextPage && !transactions.isPending && !transactions.error && loaded !== block.tx_count && <p role="alert">The transaction page does not match the indexed count. Loaded sizes are partial.</p>}
        {errors.length > 0 && <details><summary>{errors.length} transactions could not be decoded; byte totals are partial.</summary>{errors.map((error, index) => <p key={index}>{error.hash ? <HashLink kind="tx" id={error.hash} /> : "Unidentified transaction"} {error.message}</p>)}</details>}
      </>}
    </section>
  );
}
