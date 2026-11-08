import { DINGO_NETWORK } from "../../lib/dingo/config";
import { TransactionOutputs } from "../wallet/TransactionOutputs";
import { useRef, useState } from "react";
import type { Core } from "@blaze-cardano/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import { useDraftGuard } from "../../lib/useDraftGuard";
import { useWalletStore } from "../../stores/walletStore";
import {
  readTransaction,
  transactionEnvelope,
} from "../../lib/transactions/studio";
import {
  ConfirmationFailure,
  readTransactionConfirmation,
} from "../../lib/dingo/transactionConfirmation";
import { formatNativeCoin } from "../../lib/format";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import { Link } from "../NetworkLink";
import "./markets.css";

export type MarketTracking = {
  hash: string;
  submitted: (hash: string) => void;
};

export function MarketTransaction<T extends { tx: Core.Transaction }>({
  draftKey,
  ready,
  prepare,
  submit,
  title,
  children,
  reviewDetails,
  tracking,
}: {
  draftKey: string;
  ready: boolean;
  title: string;
  children?: React.ReactNode;
  reviewDetails?: (draft: T) => React.ReactNode;
  tracking: MarketTracking;
  prepare: (api: Cip30WalletApi, assertCurrent: () => void) => Promise<T>;
  submit: (
    draft: T,
    api: Cip30WalletApi,
    assertCurrent: () => void,
  ) => Promise<string>;
}) {
  const wallet = useWalletStore();
  const connected = wallet.status === "connected" && wallet.walletApi !== null;
  const scopeKey = JSON.stringify([
    draftKey,
    wallet.connectionId,
    wallet.status,
    wallet.changeAddress,
    wallet.rewardAddress,
    ready,
    tracking.hash,
  ]);
  const [scope, setScope] = useState({
    key: scopeKey,
    api: wallet.walletApi,
    revision: 0,
  });
  const assertActive = useDraftGuard(
    JSON.stringify([scopeKey, scope.revision]),
  );
  const [draft, setDraft] = useState<T | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  // A replaced API must invalidate old approvals even if a wallet reuses its connection counter.
  if (scope.key !== scopeKey || scope.api !== wallet.walletApi) {
    setScope({
      key: scopeKey,
      api: wallet.walletApi,
      revision: scope.revision + 1,
    });
    setDraft(null);
    setError("");
  }
  function assertCurrent() {
    assertActive();
    const current = useWalletStore.getState();
    if (
      current.walletApi !== wallet.walletApi ||
      current.connectionId !== wallet.connectionId ||
      current.changeAddress !== wallet.changeAddress ||
      current.rewardAddress !== wallet.rewardAddress ||
      current.status !== "connected"
    )
      throw new Error("Wallet changed. Review a new transaction.");
  }
  async function build() {
    if (
      !wallet.walletApi ||
      !connected ||
      !ready ||
      tracking.hash ||
      pending.current
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      assertCurrent();
      const next = await prepare(wallet.walletApi, assertCurrent);
      assertCurrent();
      setDraft(next);
    } catch (cause) {
      try {
        assertCurrent();
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not build this transaction.",
        );
      } catch {
        /* The abandoned draft owns no result. */
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function sign() {
    if (
      !draft ||
      !wallet.walletApi ||
      !connected ||
      !ready ||
      tracking.hash ||
      pending.current
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      assertCurrent();
      const id = await submit(draft, wallet.walletApi, assertCurrent);
      tracking.submitted(id);
      setDraft(null);
      void useWalletStore.getState().refreshBalance();
    } catch (cause) {
      try {
        assertCurrent();
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not submit this transaction.",
        );
      } catch {
        /* The abandoned draft owns no result. */
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!draft) return;
    try {
      assertCurrent();
    } catch {
      return;
    }
    const envelope = transactionEnvelope(
      readTransaction(draft.tx.toCbor(), "ConwayEra"),
    );
    const url = URL.createObjectURL(
      new Blob([envelope], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.tx.getId()}.tx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="market-transaction">
      <h3>{title}</h3>
      {children}
      {!connected && <WalletConnectSummary />}
      {draft && !tracking.hash ? (
        <>
          {reviewDetails?.(draft)}
          <div className="market-review">
            <span>Network fee</span>
            <strong>{formatNativeCoin(draft.tx.body().fee())}</strong>
          </div>
          <TransactionOutputs tx={draft.tx} />
          <p>
            Review the amounts above. Your wallet signs; Dingo submits to{" "}
            {DINGO_NETWORK.label}.
          </p>
          <div className="market-actions">
            <button
              className="experience-primary"
              disabled={busy}
              onClick={() => void sign()}
            >
              {busy ? "Waiting…" : "Sign & submit"}
            </button>
            <button disabled={busy} onClick={download}>
              Export cardano-cli JSON
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Discard draft
            </button>
            <Link
              to="/wallet/tools/transactions"
              state={{ transactionCbor: draft.tx.toCbor() }}
            >
              Inspect transaction ↗
            </Link>
          </div>
        </>
      ) : (
        !tracking.hash && (
          <button
            className="experience-primary"
            disabled={!ready || !connected || busy}
            onClick={() => void build()}
          >
            {busy ? "Building…" : "Review transaction"}
          </button>
        )
      )}
      {error && (
        <p role="alert" className="tool-error">
          {error}
        </p>
      )}
      {tracking.hash && (
        <p role="status">Follow your submitted transaction’s progress.</p>
      )}
    </section>
  );
}

export function MarketConfirmation({ tracking, resetLabel = "Start a new transaction" }: { tracking: MarketTracking; resetLabel?: string }) {
  const client = useQueryClient();
  const confirmation = useQuery({
    queryKey: ["dingo", "markets", "confirmation", tracking.hash],
    enabled: !!tracking.hash,
    retry: false,
    refetchInterval: (q) => (q.state.data || q.state.error ? false : 10000),
    queryFn: async ({ signal }) => {
      let result;
      try {
        result = await readTransactionConfirmation(tracking.hash, signal);
      } catch (error) {
        if (error instanceof ConfirmationFailure)
          void useWalletStore.getState().refreshBalance();
        throw error;
      }
      if (result) {
        void useWalletStore.getState().refreshBalance();
        void client.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === "dingo" &&
            q.queryKey[1] === "markets" &&
            q.queryKey[2] !== "confirmation" &&
            q.queryKey[3] !== "history",
          refetchType: "active",
        });
      }
      return result;
    },
  });
  const failed = confirmation.error instanceof ConfirmationFailure;
  if (!tracking.hash) return null;
  return (
    <div
      className={`market-confirmation${failed ? " failed" : ""}`}
      role="status"
    >
      <strong>
        {confirmation.data
          ? `Confirmed on ${DINGO_NETWORK.label}`
          : failed
            ? "Transaction failed on chain"
            : confirmation.error
              ? "Confirmation unavailable"
              : "Submitted · waiting for inclusion"}
      </strong>
      <Link to={`/explorer/tx/${tracking.hash}`}>View transaction ↗</Link>
      {confirmation.error && <p>{confirmation.error.message}</p>}
      {confirmation.error && !failed && (
        <button onClick={() => void confirmation.refetch()}>
          Retry confirmation
        </button>
      )}
      {!confirmation.data && !failed && (
        <>
          <p>
            Stopping tracking does not cancel this transaction. It may still
            confirm.
          </p>
          <button onClick={() => tracking.submitted("")}>
            Stop tracking this transaction
          </button>
        </>
      )}
      {(confirmation.data || failed) && (
        <button onClick={() => tracking.submitted("")}>
          {resetLabel}
        </button>
      )}
    </div>
  );
}
