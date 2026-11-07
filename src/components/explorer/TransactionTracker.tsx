import { useQuery } from "@tanstack/react-query";
import { useMempoolStore } from "../../stores/mempoolStore";
import { useSubmissionStore } from "../../stores/submissionStore";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import {
  isTransactionHash,
  readTrackingSnapshot,
  trackingVerdict,
} from "../../lib/explorer/transactionTracking";
import { CopyButton } from "./CopyButton";
import { Link } from "../NetworkLink";
import "./developer-tools.css";

export function TransactionTracker({ hash }: { hash: string }) {
  const normalized = hash.toLowerCase();
  const receipt = useSubmissionStore((s) => s.receipts.get(normalized));
  const pending = useMempoolStore((s) => s.pendingTxs.get(normalized));
  const stream = useMempoolStore((s) => s.status);
  const query = useQuery({
    queryKey: ["dingo", "transaction-tracker", DINGO_NETWORK.id, normalized],
    queryFn: ({ signal }) => readTrackingSnapshot(normalized, signal),
    enabled: isTransactionHash(normalized),
    retry: false,
    refetchInterval: 10000,
  });
  if (!isTransactionHash(normalized))
    return <p role="alert">Enter a 64-character transaction ID.</p>;
  const snapshot = query.isError ? undefined : query.data;
  const inclusion = snapshot?.inclusion;
  const validUntil =
    (receipt?.network === DINGO_NETWORK.id ? receipt.validUntil : undefined) ??
    pending?.validUntil;
  const verdict = query.isError
    ? "Tracking unavailable"
    : trackingVerdict(snapshot, !!pending && stream === "live", validUntil);
  const depth =
    inclusion &&
    snapshot &&
    snapshot.tip.height >= inclusion.block_height &&
    (snapshot.tip.height !== inclusion.block_height ||
      snapshot.tip.hash === inclusion.block)
      ? snapshot.tip.height - inclusion.block_height + 1
      : null;
  return (
    <section
      className="developer-panel transaction-tracker"
      aria-label="Transaction tracker"
    >
      <header>
        <div>
          <span className="eyebrow">
            Transaction journey · {DINGO_NETWORK.label}
          </span>
          <h2>Follow it onto the chain.</h2>
        </div>
        <span className="developer-badge" role="status">
          {verdict}
        </span>
      </header>
      <div className="developer-identifier">
        <code>{normalized}</code>
        <CopyButton value={normalized} label="tracked transaction ID" />
      </div>
      <ol className="tracking-steps">
        <li data-observed={!!receipt}>
          <span>01</span>
          <strong>Submitted</strong>
          <p>
            {receipt
              ? `Accepted by Dingo in this tab at ${new Date(receipt.submittedAt).toLocaleTimeString()}.`
              : "No submission receipt in this tab. Wallet signing and submission history are unknown."}
          </p>
        </li>
        <li data-observed={!!pending && stream === "live"}>
          <span>02</span>
          <strong>Mempool</strong>
          <p>
            {pending && stream === "live"
              ? `Observed at ${new Date(pending.seenAt).toLocaleTimeString()}.`
              : stream === "live"
                ? "Not currently observed. It may already be included, evicted, or unseen by this node."
                : "Mempool feed unavailable; current presence is unknown."}
          </p>
        </li>
        <li data-observed={!!inclusion}>
          <span>03</span>
          <strong>Included</strong>
          <p>
            {inclusion ? (
              <>
                <Link to={`/explorer/block/${inclusion.block}`}>
                  Block #{inclusion.block_height.toLocaleString()}
                </Link>{" "}
                · {new Date(inclusion.block_time * 1000).toLocaleString()}
                {!inclusion.valid_contract &&
                  ". Script validation failed; intended actions were not applied. Collateral rules apply."}
              </>
            ) : (
              "Waiting for indexed inclusion. A missing record does not establish rejection."
            )}
          </p>
        </li>
        <li data-observed={depth !== null}>
          <span>04</span>
          <strong>Confirmations</strong>
          <p>
            {depth !== null
              ? `${depth.toLocaleString()} including the containing block. This count can decrease after a rollback.`
              : "Available when inclusion and a compatible chain tip are observed."}
          </p>
        </li>
      </ol>
      {validUntil !== undefined && (
        <p className="developer-note">
          Valid before slot {validUntil.toLocaleString()}.{" "}
          {verdict === "Validity window ended"
            ? "The observed chain has reached this upper bound. It cannot be newly included now; indexing may still reveal earlier inclusion."
            : "The upper bound is exclusive."}
        </p>
      )}
      {query.error && (
        <p role="alert">
          {query.error.message} Current inclusion and confirmation count could
          not be verified.
        </p>
      )}
      <div className="developer-actions">
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Checking…" : "Check again"}
        </button>
        <Link to={`/explorer/tx/${normalized}`}>Transaction details →</Link>
      </div>
      <p className="developer-note">
        Rechecked every 10 seconds. Inclusion is re-read to reflect rollbacks.
        No fixed confirmation count is treated as finality.
      </p>
    </section>
  );
}
