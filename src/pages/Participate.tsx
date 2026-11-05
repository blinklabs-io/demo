import { governanceName } from "../lib/governanceMetadata";
import { Link } from "../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../lib/dingo/blockfrost";
import { type VotingProposal } from "../lib/dingo/governanceVote";
import { holderClosingEpoch } from "../lib/surveys/cip204";
import { useNodeHealth } from "../lib/dingo/nodeHealth";
import { PaginatedList } from "../components/explorer/PaginatedList";
import { Panel } from "../components/explorer/Panel";
import { shortenHash } from "../lib/format";
interface Action {
  id: string;
  governance_type: string;
}
function ActionCard({ action }: { action: Action }) {
  const health = useNodeHealth();
  const query = useQuery({
    queryKey: ["dingo", "proposal", action.id],
    queryFn: async ({ signal }) => {
      const proposal = await blockfrostFetch<VotingProposal>(
        `/api/v0/governance/proposals/${encodeURIComponent(action.id)}`,
        { signal },
      );
      holderClosingEpoch(proposal);
      return proposal;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const metadata = useQuery({
    queryKey: ["dingo", "proposal", action.id, "metadata"],
    queryFn: ({ signal }) =>
      blockfrostFetch<{ json_metadata?: unknown }>(
        `/api/v0/governance/proposals/${encodeURIComponent(action.id)}/metadata`,
        { signal },
      ),
    staleTime: 300000,
    retry: false,
  });
  const title = governanceName(metadata.data?.json_metadata);
  const open =
    query.data && health.data && !query.isError && !health.isError
      ? health.data.tipEpoch < holderClosingEpoch(query.data)
      : undefined;
  return (
    <Link
      className="participation-action"
      to={`/explorer/proposal/${encodeURIComponent(action.id)}#holder-answer`}
    >
      <span className={`participation-status ${open ? "open" : ""}`}>
        {open === undefined
          ? query.error || health.error
            ? "Status unavailable"
            : "Checking status…"
          : open
            ? "Accepting holder answers"
            : "Answers closed"}
      </span>
      <span className="participation-emblem" aria-hidden="true">
        {{
          treasury_withdrawals: "₳",
          new_constitution: "§",
          no_confidence: "◇",
          info_action: "i",
          parameter_change: "⚙",
          hard_fork_initiation: "⑂",
          update_committee: "◈",
        }[action.governance_type] ?? "◈"}
      </span>
      {title && (
        <span className="eyebrow">
          {action.governance_type.replaceAll("_", " ")}
        </span>
      )}
      <h3>{title ?? action.governance_type.replaceAll("_", " ")}</h3>
      {query.data && (
        <small>Answers close at epoch {holderClosingEpoch(query.data)}</small>
      )}
      {metadata.error && <small>Action title could not be loaded</small>}
      <code>{shortenHash(action.id, 16)}</code>
      <strong>
        {open ? "Record your opinion" : "Explore action & answers"} ↗
      </strong>
    </Link>
  );
}
export default function Participate() {
  return (
    <div className="participation-page">
      <section className="participation-hero">
        <div className="participation-seal" aria-hidden="true">
          ◉
        </div>
        <div>
          <span className="eyebrow">Your stake key. Your voice.</span>
          <h1>Participate in governance.</h1>
          <p>
            Give your opinion on a governance action, ask a question of your
            own, or vote as a DRep. Pick how you want to participate.
          </p>
          <a className="experience-primary" href="#holder-actions">
            Find an action to answer ↓
          </a>
        </div>
      </section>
      <div className="participation-paths">
        <a href="#holder-actions">
          <span>01 · CIP-204</span>
          <h2>Answer as a holder</h2>
          <p>
            Yes, No, or Abstain on an existing action. No survey creator. Your
            stake key proves it’s you.
          </p>
          <strong>Find an action ↓</strong>
        </a>
        <Link to="/explorer/surveys">
          <span>02 · CIP-179</span>
          <h2>Ask the community</h2>
          <p>
            Create a survey with choices, rankings, ratings, or free text.
            Respond and inspect results on chain.
          </p>
          <strong>Explore surveys ↗</strong>
        </Link>
        <Link to="/explorer/governance">
          <span>03 · Official governance</span>
          <h2>Step into the chamber</h2>
          <p>
            Follow the votes behind a decision. Connected DReps can cast their
            official vote.
          </p>
          <strong>Open governance ↗</strong>
        </Link>
        <Link to="/explorer/dreps">
          <span>04 · Representation</span>
          <h2>Find your representative</h2>
          <p>
            Explore DRep profiles and activity before choosing who represents
            your stake.
          </p>
          <strong>Meet the representatives ↗</strong>
        </Link>
      </div>
      <section id="holder-actions">
        <Panel title="Governance actions · holder answers">
          <p className="survey-note">
            CIP-204 answers are public opinions, separate from official votes.
            Your stake credential must have been registered before the action
            and remain registered. A later eligible answer replaces your earlier
            one.
          </p>
          <PaginatedList<Action>
            queryKey={["dingo", "holder-actions"]}
            pageSize={6}
            buildUrl={(page, count) =>
              `/api/v0/governance/proposals?page=${page}&count=${count}&order=desc`
            }
            keyFor={(action) => action.id}
            renderItem={(action) => <ActionCard action={action} />}
            emptyLabel="No governance actions returned by Dingo."
          />
        </Panel>
      </section>
    </div>
  );
}
