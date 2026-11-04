import { useQuery } from "@tanstack/react-query";
import { loadHolderResults } from "../../lib/surveys/cip204";
import type { VotingProposal } from "../../lib/dingo/governanceVote";
import { Distribution } from "./Visuals";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";
import { CopyButton } from "./CopyButton";
export function HolderResults({ proposal }: { proposal: VotingProposal }) {
  const query = useQuery({
    queryKey: ["dingo", "holder-results", proposal.id],
    queryFn: ({ signal }) => loadHolderResults(proposal, signal),
    enabled: false,
    retry: false,
  });
  const counted = query.data?.entries.filter((entry) => entry.counted) ?? [];
  return (
    <Panel
      title="The holders’ perspective"
      action={
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching
            ? "Verifying chain records…"
            : query.data
              ? "Recount answers"
              : "Load verified answers"}
        </button>
      }
    >
      <p className="survey-note">
        On-demand recount using Dingo: successful transactions, required stake
        signers, action deadlines, uninterrupted registration, and the latest
        answer per stake credential. Counts represent credentials, not unique
        people or official voting power.
      </p>
      {query.isFetching && (
        <div role="status" className="holder-loading">
          Reading metadata and registration history. Every counted answer is
          verified.
        </div>
      )}
      {query.error && (
        <p role="alert" className="text-red-300">
          The recount could not complete: {query.error.message}
        </p>
      )}
      {query.data && !query.isFetching && !query.error && (
        <>
          <Distribution
            title="Holder opinions"
            unit={`${counted.length} eligible stake credentials`}
            items={[
              ["No", 0],
              ["Yes", 1],
              ["Abstain", 2],
            ].map(([label, choice]) => {
              const total = counted.filter(
                (entry) => entry.choice === choice,
              ).length;
              return {
                label: String(label),
                value: BigInt(total),
                display: String(total),
              };
            })}
          />
          <p className="survey-note">
            {query.data.scanned} metadata rows scanned · {query.data.candidates}{" "}
            matching transactions inspected · {query.data.invalid} malformed or
            unsupported matching records excluded · counted at{" "}
            {new Date(query.dataUpdatedAt).toLocaleString()}. Snapshot block #
            {query.data.snapshot.height.toLocaleString()}. Recount to include
            changes to answers or registration.
          </p>
          <details className="detail-disclosure">
            <summary>
              Inspect answer records ({query.data.entries.length})
            </summary>
            <div className="holder-audit">
              {query.data.entries.map((entry) => (
                <article key={`${entry.hash}:${entry.answerIndex}`}>
                  <strong>{["No", "Yes", "Abstain"][entry.choice]}</strong>
                  <span>{entry.reason}</span>
                  <div className="holder-credential">
                    <code>{entry.key}</code>
                    <CopyButton value={entry.key} label="stake key hash" />
                  </div>
                  <HashLink kind="tx" id={entry.hash} />
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}
