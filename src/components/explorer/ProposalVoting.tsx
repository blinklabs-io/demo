import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useWalletStore } from "../../stores/walletStore";
import { useWalletDRep } from "../../lib/dingo/useWalletDRep";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import {
  governanceError,
  prepareGovernanceVote,
  submitGovernanceVote,
  votingClosed,
  type PreparedVote,
  type VoteChoice,
  type VotingProposal,
} from "../../lib/dingo/governanceVote";
import { formatAda } from "../../lib/format";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";

const choices = [
  {
    value: "yes",
    label: "Yes",
    symbol: "✓",
    description: "Support this action",
  },
  { value: "no", label: "No", symbol: "×", description: "Oppose this action" },
  {
    value: "abstain",
    label: "Abstain",
    symbol: "−",
    description: "Record an abstention",
  },
] as const;

export function ProposalVoting({ proposal }: { proposal: VotingProposal }) {
  const api = useWalletStore((state) => state.walletApi);
  const connectionId = useWalletStore((state) => state.connectionId);
  return (
    <VotingForm
      key={`${proposal.id}:${connectionId}`}
      proposal={proposal}
      api={api}
      connectionId={connectionId}
    />
  );
}

function VotingForm({
  proposal,
  api,
  connectionId,
}: {
  proposal: VotingProposal;
  api: ReturnType<typeof useWalletStore.getState>["walletApi"];
  connectionId: number;
}) {
  const role = useWalletDRep();
  const health = useNodeHealth();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [prepared, setPrepared] = useState<PreparedVote | null>(null);
  const closed = health.data && votingClosed(proposal, health.data.tipEpoch);
  function assertConnection() {
    const current = useWalletStore.getState();
    if (
      current.status !== "connected" ||
      current.walletApi !== api ||
      current.connectionId !== connectionId
    )
      throw new Error(
        "Your wallet connection changed. Reconnect and review your vote again.",
      );
  }
  const prepare = useMutation({
    mutationFn: async () => {
      if (!api || !choice)
        throw new Error("Connect your DRep wallet and choose a vote.");
      try {
        return await prepareGovernanceVote(
          api,
          proposal,
          choice,
          assertConnection,
        );
      } catch (error) {
        throw governanceError(error, "Unable to prepare your vote.");
      }
    },
    onSuccess: setPrepared,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !prepared)
        throw new Error("Review your vote before signing.");
      try {
        return await submitGovernanceVote(
          api,
          proposal,
          prepared,
          assertConnection,
        );
      } catch (error) {
        throw governanceError(error, "Unable to sign or submit your vote.");
      } finally {
        setPrepared(null);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["dingo", "proposal", proposal.id, "votes"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dingo", "wallet", "drep-role", connectionId],
      });
      void useWalletStore.getState().refreshBalance();
    },
  });
  const busy = prepare.isPending || submit.isPending;
  const eligible = Boolean(
    api?.cip95 && role.data && !role.data.retired && !closed && health.data,
  );
  const error = prepare.error || submit.error;
  return (
    <div id="drep-vote">
      <Panel
        title="Your DRep vote"
        action={<span className="status-badge">Preview</span>}
      >
        {closed ? (
          <p className="vote-closed">
            Voting is closed for this governance action.
          </p>
        ) : !api ? (
          <div className="vote-connect">
            <div>
              <h3>Make your voice count.</h3>
              <p>Connect your DRep wallet to vote on this governance action.</p>
            </div>
            <WalletConnectSummary />
          </div>
        ) : !api.cip95 ? (
          <p className="text-sm text-slate-400">
            This wallet connection does not expose a DRep key. Connect a wallet
            with governance voting support.
          </p>
        ) : role.isPending ? (
          <p className="directory-progress" role="status">
            Checking your DRep registration…
          </p>
        ) : role.isError ? (
          <div role="alert" className="text-sm text-red-300">
            <p>{role.error.message}</p>
            <button
              type="button"
              className="mt-2 text-teal-300"
              onClick={() => void role.refetch()}
            >
              Retry DRep lookup
            </button>
          </div>
        ) : !role.data || role.data.retired ? (
          <p className="text-sm text-slate-400">
            This wallet’s DRep credential is{" "}
            {role.data?.retired ? "retired" : "not registered"} on Preview.
          </p>
        ) : (
          <>
            <div className="vote-voter">
              <span>Voting as</span>
              <HashLink kind="drep" id={role.data.drep_id} full />
              <span className="status-badge">
                {role.data.expired
                  ? "Renew activity with a vote"
                  : "Registered DRep"}
              </span>
            </div>
            <fieldset
              className="vote-choices"
              disabled={busy || Boolean(prepared)}
            >
              <legend className="sr-only">Choose your vote</legend>
              {choices.map((option) => (
                <label
                  key={option.value}
                  className={`vote-choice vote-${option.value}${choice === option.value ? " selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="governance-vote"
                    value={option.value}
                    checked={choice === option.value}
                    onChange={() => {
                      setChoice(option.value);
                      prepare.reset();
                      submit.reset();
                    }}
                  />
                  <span className="vote-choice-symbol" aria-hidden="true">
                    {option.symbol}
                  </span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            {prepared ? (
              <div className="vote-review" aria-label="Vote review">
                <div className="vote-review-heading">
                  <span
                    className={`vote-review-choice vote-${prepared.choice}`}
                  >
                    {
                      choices.find(
                        (option) => option.value === prepared.choice,
                      )!.label
                    }
                  </span>
                  <span>Review your vote</span>
                </div>
                <dl>
                  <div>
                    <dt>Governance action</dt>
                    <dd className="font-mono break-all">
                      {proposal.tx_hash}#{proposal.cert_index}
                    </dd>
                  </div>
                  <div>
                    <dt>Network fee</dt>
                    <dd>{formatAda(prepared.tx.body().fee())}</dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>Cardano Preview</dd>
                  </div>
                </dl>
                <p>
                  Your wallet pays the network fee and asks you to approve this
                  DRep vote.
                </p>
                <div className="vote-actions">
                  <button
                    type="button"
                    className="vote-submit"
                    disabled={busy || !eligible}
                    onClick={() => submit.mutate()}
                  >
                    {submit.isPending
                      ? "Awaiting wallet & submission…"
                      : "Sign & submit vote"}
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
                    Change vote
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="vote-submit"
                disabled={!choice || !eligible || busy}
                onClick={() => {
                  submit.reset();
                  prepare.mutate();
                }}
              >
                {prepare.isPending ? "Preparing vote…" : "Review vote"}
              </button>
            )}
            {health.isError && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                Unable to verify the current epoch.{" "}
                <button type="button" onClick={() => void health.refetch()}>
                  Retry network check
                </button>
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error.message}
          </p>
        )}
        {submit.data && (
          <div className="vote-success" role="status">
            <strong>Vote submitted</strong>
            <p>Waiting for on-chain confirmation.</p>
            <Link
              to={`/explorer/tx/${submit.data}`}
              className="font-mono break-all"
            >
              {submit.data}
            </Link>
          </div>
        )}
      </Panel>
    </div>
  );
}
