import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import {
  governanceError,
  type VotingProposal,
  type VoteChoice,
} from "../../lib/dingo/governanceVote";
import {
  prepareHolderAnswer,
  submitHolderAnswer,
  holderClosingEpoch,
  type PreparedHolderAnswer,
} from "../../lib/surveys/cip204";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";
import { CopyButton } from "./CopyButton";
import { formatAda } from "../../lib/format";

export function HolderAnswer({ proposal }: { proposal: VotingProposal }) {
  const connection = useWalletStore((s) => s.connectionId);
  return (
    <AnswerForm
      key={`${proposal.id}:${connection}`}
      proposal={proposal}
      connection={connection}
    />
  );
}
function AnswerForm({
  proposal,
  connection,
}: {
  proposal: VotingProposal;
  connection: number;
}) {
  const api = useWalletStore((s) => s.walletApi);
  const health = useNodeHealth();
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [draft, setDraft] = useState<PreparedHolderAnswer | null>(null);
  const closed = health.data
    ? health.data.tipEpoch >= holderClosingEpoch(proposal)
    : undefined;
  function assertConnection() {
    const state = useWalletStore.getState();
    if (
      state.status !== "connected" ||
      state.walletApi !== api ||
      state.connectionId !== connection
    )
      throw new Error("Wallet connection changed. Review a new answer.");
  }
  const prepare = useMutation({
    mutationFn: async () => {
      if (!api || !choice)
        throw new Error("Connect a wallet and choose an answer.");
      try {
        return await prepareHolderAnswer(
          api,
          proposal,
          choice,
          assertConnection,
        );
      } catch (error) {
        throw governanceError(error, "Unable to prepare your holder answer.");
      }
    },
    onSuccess: setDraft,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !draft) throw new Error("Review your answer first.");
      try {
        return await submitHolderAnswer(api, draft, assertConnection);
      } catch (error) {
        throw governanceError(error, "Unable to submit your holder answer.");
      } finally {
        setDraft(null);
      }
    },
  });
  const confirmation = useQuery({
    queryKey: ["dingo", "holder-answer", submit.data],
    enabled: Boolean(submit.data),
    retry: false,
    refetchInterval: (q) => (q.state.data || q.state.error ? false : 10000),
    queryFn: async () => {
      try {
        const tx = await blockfrostFetch<{
          hash: string;
          block: string;
          valid_contract: boolean;
        }>(`/api/v0/txs/${submit.data}`);
        if (tx.hash !== submit.data || !tx.block || !tx.valid_contract)
          throw new Error("Answer was not included in a valid transaction.");
        return tx;
      } catch (error) {
        if (error instanceof BlockfrostError && error.status === 404)
          return null;
        throw error;
      }
    },
  });
  const busy = prepare.isPending || submit.isPending;
  const error = prepare.error ?? submit.error ?? confirmation.error;
  return (
    <Panel title="Your voice · CIP-204">
      <div id="holder-answer" className="holder-answer">
        <div className="holder-intro">
          <span className="holder-mark" aria-hidden="true">
            ◉
          </span>
          <div>
            <span className="eyebrow">Holder opinion · public on chain</span>
            <h3>You don’t have to be a DRep to be heard.</h3>
            <p>
              Answer this governance action with your stake key. This records
              your opinion; it does not cast an official governance vote.
            </p>
          </div>
        </div>
        <div className="holder-rules">
          <span>Stake key registered before the action</span>
          <span>No interrupted registration</span>
          <span>Latest eligible answer counts</span>
        </div>
        {closed ? (
          <p role="status">Answers are closed for this action.</p>
        ) : !api ? (
          <WalletConnectSummary />
        ) : (
          !draft &&
          !submit.data && (
            <>
              <div
                className="holder-choices"
                role="group"
                aria-label="Your holder opinion"
              >
                {(
                  [
                    ["yes", "✓", "Support"],
                    ["no", "×", "Oppose"],
                    ["abstain", "−", "Abstain"],
                  ] as const
                ).map(([value, icon, description]) => (
                  <button
                    type="button"
                    key={value}
                    className={`holder-choice ${value}`}
                    aria-pressed={choice === value}
                    disabled={busy}
                    onClick={() => setChoice(value)}
                  >
                    <span aria-hidden="true">{icon}</span>
                    <strong>
                      {value === "yes"
                        ? "Yes"
                        : value === "no"
                          ? "No"
                          : "Abstain"}
                    </strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              <button
                className="survey-primary"
                type="button"
                disabled={!choice || busy || closed === undefined}
                onClick={() => prepare.mutate()}
              >
                {prepare.isPending
                  ? "Checking registration history…"
                  : "Review public answer"}
              </button>
            </>
          )
        )}
        {draft && (
          <section className="survey-review">
            <span className="eyebrow">Actual transaction · metadata 1695</span>
            <h3>Your answer: {draft.choice.toUpperCase()}</h3>
            <p>
              Action <HashLink kind="tx" id={draft.proposal.tx_hash} /> #
              {draft.proposal.cert_index}
            </p>
            <div className="holder-credential">
              <code>{draft.identity.stakeAddress}</code>
              <CopyButton
                value={draft.identity.stakeAddress}
                label="stake address"
              />
            </div>
            <p>
              Network fee <strong>{formatAda(draft.tx.body().fee())}</strong> ·
              Preview
            </p>
            <p>
              Your stake credential and answer will be public and permanent.
              Eligibility is checked again before signing. Dingo submits the
              transaction.
            </p>
            <div className="survey-actions">
              <button
                className="survey-primary"
                type="button"
                disabled={busy}
                onClick={() => submit.mutate()}
              >
                {submit.isPending
                  ? "Waiting for wallet…"
                  : "Sign & submit answer"}
              </button>
              <button
                type="button"
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
        {error && (
          <p role="alert" className="text-red-300">
            {error.message}
          </p>
        )}
        {submit.data && (
          <div role="status" className="survey-submitted">
            <strong>
              {confirmation.data
                ? "Answer confirmed on chain"
                : "Submitted · waiting for confirmation"}
            </strong>
            <HashLink kind="tx" id={submit.data} />
            {confirmation.error && (
              <button type="button" onClick={() => void confirmation.refetch()}>
                Retry confirmation
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                submit.reset();
                prepare.reset();
                setChoice(null);
              }}
            >
              Prepare another answer
            </button>
          </div>
        )}
        <p className="survey-note">
          CIP-204 is a proposed standard. Answers close when the action leaves
          voting or its lifetime ends. Ratification alone does not close this
          window. Fees are test ADA.
        </p>
      </div>
    </Panel>
  );
}
