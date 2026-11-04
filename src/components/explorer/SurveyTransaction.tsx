import { useDraftGuard } from "../../lib/useDraftGuard";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useWalletStore } from "../../stores/walletStore";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import {
  prepareSurveyTransaction,
  submitSurveyTransaction,
  type SurveyAction,
  type PreparedSurvey,
} from "../../lib/surveys/transactions";
import { governanceError } from "../../lib/dingo/governanceVote";
import {
  isRetryableConfirmation,
  readTransactionConfirmation,
} from "../../lib/dingo/transactionConfirmation";
import { formatAda } from "../../lib/format";
import { HashLink } from "./HashLink";
import { answerLabel, questionNames } from "../../lib/surveys/cip179";
export function SurveyTransaction({
  action,
  label,
  ready,
  draftKey,
}: {
  draftKey: string;
  action: () => SurveyAction;
  label: string;
  ready: boolean;
}) {
  const connectionId = useWalletStore((s) => s.connectionId);
  const key = JSON.stringify([connectionId, draftKey]);
  const assertDraft = useDraftGuard(key);
  return (
    <TransactionForm
      key={connectionId}
      draftKey={key}
      assertDraft={assertDraft}
      action={action}
      label={label}
      connectionId={connectionId}
      ready={ready}
    />
  );
}
function TransactionForm({
  draftKey,
  action,
  label,
  connectionId,
  ready,
  assertDraft,
}: {
  draftKey: string;
  assertDraft: () => void;
  action: () => SurveyAction;
  label: string;
  connectionId: number;
  ready: boolean;
}) {
  const api = useWalletStore((s) => s.walletApi);
  const client = useQueryClient();
  const [draft, setDraft] = useState<{
    key: string;
    value: PreparedSurvey;
  } | null>(null);
  const prepared = draft?.key === draftKey ? draft.value : null;
  const setPrepared = (value: PreparedSurvey | null) =>
    setDraft(value && { key: draftKey, value });
  const [submittedAction, setSubmittedAction] = useState<SurveyAction | null>(
    null,
  );
  function assertConnection() {
    assertDraft();
    const s = useWalletStore.getState();
    if (
      s.status !== "connected" ||
      s.walletApi !== api ||
      s.connectionId !== connectionId
    )
      throw new Error("Wallet connection changed. Review a new transaction.");
  }
  const prepare = useMutation({
    mutationFn: async () => {
      if (!api) throw new Error("Connect a wallet first.");
      try {
        return await prepareSurveyTransaction(api, action(), assertConnection);
      } catch (e) {
        throw governanceError(e, "Unable to build survey transaction.");
      }
    },
    onSuccess: setPrepared,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !prepared) throw new Error("Review a transaction first.");
      try {
        setSubmittedAction(prepared.action);
        return await submitSurveyTransaction(api, prepared, assertConnection);
      } catch (e) {
        throw governanceError(
          e,
          "Unable to sign or submit survey transaction.",
        );
      } finally {
        setPrepared(null);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["dingo", "surveys"] });
    },
  });
  const confirmation = useQuery({
    queryKey: ["dingo", "surveys", "confirmation", submit.data],
    enabled: Boolean(submit.data),
    retry: false,
    queryFn: async ({ signal }) => {
      const tx = await readTransactionConfirmation(submit.data!, signal);
      if (tx) {
        await client.invalidateQueries({
          queryKey: ["dingo", "surveys", "results"],
        });
        await client.invalidateQueries({
          queryKey: ["dingo", "surveys", "directory"],
        });
      }
      return tx;
    },
    refetchInterval: (q) => (q.state.data || q.state.error ? false : 10000),
  });
  if (!api)
    return (
      <div className="survey-connect">
        <p>Connect a Preview wallet to publish on chain.</p>
        <WalletConnectSummary />
      </div>
    );
  const busy = prepare.isPending || submit.isPending;
  const error = prepare.error ?? submit.error ?? confirmation.error;
  return (
    <div className="survey-transaction">
      {!prepared && !submit.data && (
        <button
          className="survey-primary"
          type="button"
          disabled={busy || !ready}
          onClick={() => prepare.mutate()}
        >
          {prepare.isPending ? "Building transaction…" : label}
        </button>
      )}
      {prepared && (
        <section className="survey-review">
          <span className="eyebrow">Review before signing · Preview</span>
          <h3>
            {prepared.action.kind === "create"
              ? prepared.action.title
              : prepared.action.survey.title}
          </h3>
          <p>
            {prepared.action.kind === "create"
              ? `Publish ${prepared.action.questions.length} questions · closes after epoch ${prepared.action.endEpoch}`
              : prepared.action.kind === "cancel"
                ? "Cancel this survey and exclude all of its responses."
                : "Publish a public response. A newer valid response replaces your earlier response."}
          </p>
          {prepared.action.kind === "create" && (
            <div>
              <p>{prepared.action.description}</p>
              <dl>
                {prepared.action.questions.map((q, i) => (
                  <div key={i}>
                    <dt>
                      {i + 1}. {q.prompt} ·{" "}
                      {q.required ? "Required" : "Optional"}
                    </dt>
                    <dd>
                      {questionNames[q.tag]} ·{" "}
                      {q.tag === 0
                        ? "Public free text, up to 1024 UTF-8 bytes"
                        : q.tag === 4
                          ? `${q.min}–${q.max}, step ${q.step}`
                          : q.options.join(" / ")}
                      {q.tag === 2 || q.tag === 3
                        ? ` · select ${q.min}–${q.max}`
                        : q.tag === 5
                          ? ` · budget ${q.budget}`
                          : q.tag === 6
                            ? ` · scale ${q.min}–${q.max}, step ${q.step}, ${q.requireAll ? "rate all" : "partial ratings allowed"}`
                            : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {prepared.action.kind === "respond" && (
            <dl>
              {prepared.action.survey.questions.map((q, i) => (
                <div key={i}>
                  <dt>{q.prompt}</dt>
                  <dd>
                    {answerLabel(
                      q,
                      prepared.action.kind === "respond"
                        ? prepared.action.answers[i]
                        : undefined,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="survey-fee">
            Network fee <strong>{formatAda(prepared.tx.body().fee())}</strong>
          </p>
          <p>
            Questions, answers, and signing credentials are public and permanent
            on chain. Submission goes through Dingo.
          </p>
          <div className="survey-actions">
            <button
              type="button"
              className="survey-primary"
              disabled={busy}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Waiting for wallet…" : "Sign & submit"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                prepare.reset();
                submit.reset();
              }}
            >
              Cancel draft
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-red-300">
          {error.message}
        </p>
      )}
      {submit.data && (
        <div role="status" className="survey-submitted">
          <strong>
            {confirmation.data
              ? "Confirmed on chain"
              : confirmation.error && !isRetryableConfirmation(confirmation.error)
                ? "Failed · script validation rejected the transaction"
                : "Submitted · waiting for confirmation"}
          </strong>
          <HashLink kind="tx" id={submit.data} />
          {isRetryableConfirmation(confirmation.error) && (
            <button type="button" onClick={() => void confirmation.refetch()}>
              Retry confirmation
            </button>
          )}
          {(confirmation.data ||
            (confirmation.error &&
              !isRetryableConfirmation(confirmation.error))) && (
            <button
              type="button"
              onClick={() => {
                submit.reset();
                prepare.reset();
                setSubmittedAction(null);
              }}
            >
              Review another transaction
            </button>
          )}
          {confirmation.data && (
            <Link
              to={
                submittedAction && submittedAction.kind !== "create"
                  ? `/explorer/surveys/${submittedAction.survey.hash}/${submittedAction.survey.index}`
                  : `/explorer/surveys/${submit.data}/0`
              }
            >
              Open survey →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
