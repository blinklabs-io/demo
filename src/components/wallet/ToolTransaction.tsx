import { TransactionOutputs } from "./TransactionOutputs";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { useDraftGuard } from "../../lib/useDraftGuard";
import { metadataJson } from "../../lib/tools/cip25";
import { useState } from "react";
import { Link } from "../NetworkLink";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import { governanceError } from "../../lib/dingo/governanceVote";
import {
  ConfirmationFailure,
  readTransactionConfirmation,
} from "../../lib/dingo/transactionConfirmation";
import {
  prepareToolTransaction,
  submitToolTransaction,
  type PreparedTool,
  type ToolAction,
} from "../../lib/tools/transactions";
import { formatAda } from "../../lib/format";

export function ToolTransaction({
  action,
  ready = true,
  formId,
  assertDraft,
  draftKey,
}: {
  draftKey: string;
  action: () => ToolAction;
  ready?: boolean;
  formId?: string;
  assertDraft?: () => void;
}) {
  const api = useWalletStore((s) => s.walletApi),
    connectionId = useWalletStore((s) => s.connectionId);
  const assertActive = useDraftGuard(draftKey);
  const [draft, setDraft] = useState<PreparedTool | null>(null);
  const [reviewKey, setReviewKey] = useState(draftKey);
  if (reviewKey !== draftKey) {
    setReviewKey(draftKey);
    setDraft(null);
  }
  const [savedPolicy, setSavedPolicy] = useState<PreparedTool | null>(null);
  const queryClient = useQueryClient();
  const assertConnection = () => {
    assertActive();
    const s = useWalletStore.getState();
    if (
      s.status !== "connected" ||
      s.walletApi !== api ||
      s.connectionId !== connectionId
    )
      throw new Error("Wallet connection changed. Review a new draft.");
    assertDraft?.();
  };
  const prepare = useMutation({
    mutationFn: async (requestKey: string) => {
      if (requestKey !== draftKey)
        throw new Error("Draft details changed. Review a new transaction.");
      if (!api) throw new Error("Connect a wallet first.");
      try {
        const result = await prepareToolTransaction(
          api,
          action(),
          assertConnection,
        );
        assertConnection();
        return result;
      } catch (e) {
        throw governanceError(e, "Unable to prepare this transaction.");
      }
    },
    onSuccess: setDraft,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !draft) throw new Error("Review a draft first.");
      try {
        const hash = await submitToolTransaction(api, draft, assertConnection);
        setSavedPolicy(draft.policyCbor ? draft : null);
        return hash;
      } catch (e) {
        throw governanceError(e, "Unable to sign or submit this transaction.");
      } finally {
        setDraft(null);
      }
    },
    onSuccess: () => {
      void useWalletStore.getState().refreshBalance();
      void queryClient.invalidateQueries({ queryKey: ["wallet-tools"] });
    },
  });
  const confirmation = useQuery({
    queryKey: ["wallet-tools", "confirmation", submit.data],
    enabled: !!submit.data,
    retry: false,
    refetchInterval: (q) => (q.state.data || q.state.error ? false : 10000),
    queryFn: async ({ signal }) => {
      const tx = await readTransactionConfirmation(submit.data!, signal);
      if (tx) {
        void useWalletStore.getState().refreshBalance();
        void queryClient.invalidateQueries({
          queryKey: ["wallet-tools", "utxos"],
        });
      }
      return tx;
    },
  });
  const failed = confirmation.error instanceof ConfirmationFailure;
  const busy = prepare.isPending || submit.isPending;
  const error =
    (prepare.variables === draftKey ? prepare.error : null) ??
    submit.error ??
    confirmation.error;
  function downloadPolicy(policy: PreparedTool) {
    const data = JSON.stringify(
      {
        network: DINGO_NETWORK.id,
        networkMagic: DINGO_NETWORK.networkMagic,
        policyId: policy.policyId,
        nativeScriptCbor: policy.policyCbor,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-${policy.policyId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!api)
    return (
      <div className="tool-connect">
        <p>Connect a {DINGO_NETWORK.label} wallet to review and sign.</p>
        <WalletConnectSummary />
      </div>
    );
  return (
    <div className="tool-transaction">
      {!draft && !submit.data && (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !ready) return;
            submit.reset();
            prepare.mutate(draftKey);
          }}
        >
          <button
            type="submit"
            className="tool-primary"
            disabled={busy || !ready}
          >
            {prepare.isPending ? "Building with Dingo…" : "Review transaction"}
          </button>
        </form>
      )}
      {draft && (
        <section className="tool-review" aria-label="Transaction review">
          <div className="tool-review-heading">
            <div>
              <span className="eyebrow">
                Unsigned draft · {DINGO_NETWORK.label}
              </span>
              <h3>Check the actual transaction.</h3>
            </div>
            <strong>
              {formatAda(draft.tx.body().fee())}
              <small>Network fee</small>
            </strong>
          </div>
          <dl className="tool-facts">
            {draft.facts.map((fact, i) => (
              <div key={i}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <TransactionOutputs tx={draft.tx} />
          {draft.action.kind === "mint" &&
            draft.tx.auxiliaryData()?.metadata()?.toCore().get(721n) && (
              <details className="metadata-json" open>
                <summary>CIP-25 metadata · actual unsigned transaction</summary>
                <pre>
                  {metadataJson(
                    draft.tx.auxiliaryData()!.metadata()!.toCore().get(721n)!,
                  )}
                </pre>
              </details>
            )}
          {draft.policyCbor && (
            <div className="tool-policy-save">
              <button type="button" onClick={() => downloadPolicy(draft)}>
                Download policy
              </button>
              <p>
                Keep this policy to burn tokens before its expiry. This is a
                native minting policy; it does not guarantee unique NFT supply.
              </p>
            </div>
          )}
          <p className="tool-public-note">
            {draft.action.kind === "proof" || draft.action.kind === "mint"
              ? "Metadata is public and permanent. "
              : ""}
            Your wallet will ask for approval. The reviewed draft is fixed;
            edits require a new draft.
          </p>
          <div className="tool-button-row">
            <button
              className="tool-primary"
              disabled={busy}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Waiting for wallet…" : "Sign & submit"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDraft(null);
                prepare.reset();
                submit.reset();
              }}
            >
              Discard draft
            </button>
          </div>
        </section>
      )}
      {submit.data && (
        <section
          className={`tool-success${failed ? " confirmation-failed" : ""}`}
          role="status"
        >
          <strong>
            {failed
              ? "Transaction failed on chain"
              : confirmation.data
                ? `Confirmed on ${DINGO_NETWORK.label}`
                : confirmation.error
                  ? "Submitted · confirmation unavailable"
                  : "Submitted to Dingo"}
          </strong>
          <Link to={`/explorer/tx/${submit.data}`}>View transaction →</Link>
          <code>{submit.data}</code>
          {savedPolicy && (
            <button onClick={() => downloadPolicy(savedPolicy)}>
              Download minting policy
            </button>
          )}
          <button
            onClick={() => {
              submit.reset();
              prepare.reset();
              setSavedPolicy(null);
            }}
          >
            {failed ? "Start new draft" : "Start another transaction"}
          </button>
        </section>
      )}
      {error && (
        <p className="tool-error" role="alert">
          {error.message}
        </p>
      )}
      {confirmation.error && !failed && (
        <button onClick={() => void confirmation.refetch()}>
          Retry confirmation
        </button>
      )}
    </div>
  );
}
