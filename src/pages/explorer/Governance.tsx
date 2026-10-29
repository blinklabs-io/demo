import { GovernanceChamber } from "../../components/chain/GovernanceChamber";
import { ProposalVoting } from "../../components/explorer/ProposalVoting";
import {
  Timeline,
  Metric,
  Gauge,
  Distribution,
  PageIntro,
} from "../../components/explorer/Visuals";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { HashLink } from "../../components/explorer/HashLink";
import { formatAda, shortenHash } from "../../lib/format";

interface ProposalSummary {
  id: string;
  tx_hash: string;
  cert_index: number;
  governance_type: string;
}

interface Proposal extends ProposalSummary {
  governance_description: unknown;
  deposit: string;
  return_address: string;
  ratified_epoch: number | null;
  enacted_epoch: number | null;
  dropped_epoch: number | null;
  expired_epoch: number | null;
  expiration: number;
}

interface Committee {
  is_dissolved: boolean;
  quorum: { numerator: number; denominator: number };
  members: {
    cc_cold_id: string;
    cc_hot_id: string | null;
    status: string;
    expiration_epoch: number;
  }[];
}

function ProposalCard({ row }: { row: ProposalSummary }) {
  const metadata = useQuery({
    queryKey: ["dingo", "proposal", row.id, "metadata"],
    queryFn: () =>
      blockfrostFetch<{ json_metadata?: { body?: { title?: unknown } } }>(
        `/api/v0/governance/proposals/${encodeURIComponent(row.id)}/metadata`,
      ),
    staleTime: 300_000,
    retry: false,
  });
  const title = metadata.data?.json_metadata?.body?.title;
  return (
    <div className={`proposal-card proposal-${row.governance_type}`}>
      <span className="proposal-emblem" aria-hidden="true">
        {{
          treasury_withdrawals: "₳",
          new_constitution: "§",
          no_confidence: "◇",
          info_action: "i",
          parameter_change: "⚙",
          hard_fork_initiation: "⑂",
          update_committee: "◈",
        }[row.governance_type] ?? "◈"}
      </span>
      <Link
        to={`/explorer/proposal/${encodeURIComponent(row.id)}`}
        className="text-sky-400 hover:underline"
      >
        {typeof title === "string" && title.trim()
          ? title
          : row.governance_type.replaceAll("_", " ")}{" "}
        <span aria-hidden="true">↗</span>
      </Link>
      <span className="status-badge">
        {row.governance_type.replaceAll("_", " ")}
      </span>
      <small title={row.id}>{shortenHash(row.id, 12)}</small>
    </div>
  );
}

export default function Governance() {
  const committee = useQuery({
    queryKey: ["dingo", "committee"],
    queryFn: () => blockfrostFetch<Committee>("/api/v0/governance/committee"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="The next chapter is on chain"
        title="Decisions that matter."
        detail="Proposals, votes, and the people entrusted with the protocol."
        symbol="§"
      />
      <Panel title="Governance proposals">
        <PaginatedList<ProposalSummary>
          queryKey={["dingo", "proposals"]}
          buildUrl={(page, count) =>
            `/api/v0/governance/proposals?page=${page}&count=${count}&order=desc`
          }
          visualize={(rows) => (
            <div className="governance-mix">
              <Distribution
                title="Proposals on page"
                unit={String(rows.length)}
                items={Object.entries(
                  rows.reduce<Record<string, number>>((counts, row) => {
                    counts[row.governance_type] =
                      (counts[row.governance_type] ?? 0) + 1;
                    return counts;
                  }, {}),
                ).map(([label, count]) => ({
                  label: label.replaceAll("_", " "),
                  value: BigInt(count),
                  display: String(count),
                }))}
              />
              <div>
                <span className="eyebrow">A cross-section of governance</span>
                <h2>What's on the table?</h2>
                <p>
                  Action types among proposals on this page. Select a proposal
                  below to follow its lifecycle and votes.
                </p>
              </div>
            </div>
          )}
          keyFor={(row) => row.id}
          emptyLabel="No governance proposals."
          renderItem={(row) => <ProposalCard row={row} />}
        />
      </Panel>
      <Panel title="Constitutional committee">
        <QueryState isLoading={committee.isLoading} error={committee.error}>
          {committee.data && (
            <>
              <div className="committee-cockpit">
                <Gauge
                  label="Committee quorum"
                  value={
                    committee.data.quorum.denominator > 0
                      ? (committee.data.quorum.numerator /
                          committee.data.quorum.denominator) *
                        100
                      : 0
                  }
                  detail={`${committee.data.quorum.numerator} of ${committee.data.quorum.denominator}`}
                  tone="violet"
                />
                <div className="metric-grid mb-6">
                  <Metric
                    label="Members"
                    value={committee.data.members.length}
                  />
                  <Metric
                    label="Quorum"
                    value={`${committee.data.quorum.numerator}/${committee.data.quorum.denominator}`}
                  />
                  <Metric
                    label="Committee"
                    value={committee.data.is_dissolved ? "Dissolved" : "Active"}
                  />
                </div>
              </div>
              {committee.data.members.length === 0 && (
                <p className="text-sm text-slate-500">No committee members.</p>
              )}
              {committee.data.members.map((member) => (
                <div key={member.cc_cold_id} className="committee-member">
                  <div className="committee-member-heading">
                    <span className="member-symbol" aria-hidden="true">
                      ◈
                    </span>
                    <strong>{shortenHash(member.cc_cold_id, 10)}</strong>
                    <span className="status-badge">{member.status}</span>
                  </div>
                  <details>
                    <summary>Credentials & term</summary>
                    <Field label="Cold credential" value={member.cc_cold_id} />
                    <Field
                      label="Hot credential"
                      value={member.cc_hot_id ?? "—"}
                    />
                    <Field label="Status" value={member.status} />
                    <Field
                      label="Expiration epoch"
                      value={member.expiration_epoch}
                    />
                  </details>
                </div>
              ))}
            </>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}

export function ProposalDetail() {
  const { id } = useParams();
  const path = `/api/v0/governance/proposals/${encodeURIComponent(id ?? "")}`;
  const proposal = useQuery({
    queryKey: ["dingo", "proposal", id],
    queryFn: () => blockfrostFetch<Proposal>(path),
    enabled: Boolean(id),
  });

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <Link
        to="/explorer/governance"
        className="text-sm text-sky-400 hover:underline"
      >
        Governance proposals
      </Link>
      <PageIntro
        eyebrow="On-chain governance"
        title="A proposal for the network."
        symbol="§"
      />
      <Panel
        title="Governance proposal"
        action={
          proposal.data && (
            <a href="#drep-vote" className="text-xs text-teal-300">
              DRep voting ↓
            </a>
          )
        }
      >
        <QueryState
          isLoading={proposal.isLoading}
          error={proposal.error}
          notFoundLabel="Proposal not found."
        >
          {proposal.data && (
            <div>
              <div className="metric-grid mb-5">
                <Metric
                  label="Deposit"
                  value={formatAda(BigInt(proposal.data.deposit))}
                />
                <Metric
                  label="Expires"
                  value={`Epoch ${proposal.data.expiration}`}
                />
                <Metric
                  label="Status"
                  value={
                    proposal.data.enacted_epoch !== null
                      ? "Enacted"
                      : proposal.data.dropped_epoch !== null
                        ? "Dropped"
                        : proposal.data.expired_epoch !== null
                          ? "Expired"
                          : proposal.data.ratified_epoch !== null
                            ? "Ratified"
                            : "Submitted"
                  }
                />
              </div>
              <Field label="ID" value={proposal.data.id} />
              <Field label="Type" value={proposal.data.governance_type} />
              <Field
                label="Transaction"
                value={<HashLink kind="tx" id={proposal.data.tx_hash} />}
              />
              <Field
                label="Certificate index"
                value={proposal.data.cert_index}
              />

              <Field
                label="Return account"
                value={
                  <HashLink kind="account" id={proposal.data.return_address} />
                }
              />

              <div className="my-6">
                <Timeline
                  items={[
                    {
                      label: "Submitted",
                      complete: true,
                      detail: <HashLink kind="tx" id={proposal.data.tx_hash} />,
                    },
                    {
                      label: "Ratified",
                      complete: proposal.data.ratified_epoch !== null,
                      detail:
                        proposal.data.ratified_epoch === null
                          ? "Not ratified"
                          : `Epoch ${proposal.data.ratified_epoch}`,
                    },
                    {
                      label: "Enacted",
                      complete: proposal.data.enacted_epoch !== null,
                      detail:
                        proposal.data.enacted_epoch === null
                          ? "Not enacted"
                          : `Epoch ${proposal.data.enacted_epoch}`,
                    },
                    {
                      label:
                        proposal.data.dropped_epoch !== null
                          ? "Dropped"
                          : "Expiration",
                      complete:
                        proposal.data.expired_epoch !== null ||
                        proposal.data.dropped_epoch !== null,
                      detail: `Epoch ${proposal.data.dropped_epoch ?? proposal.data.expired_epoch ?? proposal.data.expiration}`,
                    },
                  ]}
                />
              </div>
              <details className="detail-disclosure">
                <summary>Governance action data</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(
                    proposal.data.governance_description,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}
        </QueryState>
      </Panel>
      {proposal.data && <ProposalVoting proposal={proposal.data} />}
      {proposal.data && <GovernanceChamber proposalId={id!} />}
    </div>
  );
}
