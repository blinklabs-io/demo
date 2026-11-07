import { governanceName } from "../../lib/governanceMetadata";
import { useEffect, useState } from "react";
import { votingClosed } from "../../lib/dingo/governanceVote";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { HolderResults } from "../../components/explorer/HolderResults";
import { HolderAnswer } from "../../components/explorer/HolderAnswer";
import { GovernanceChamber } from "../../components/chain/GovernanceChamber";
import { ProposalVoting } from "../../components/explorer/ProposalVoting";
import {
  Timeline,
  Metric,
  Gauge,
  Distribution,
  PageIntro,
} from "../../components/explorer/Visuals";
import { useParams, useLocation } from "react-router";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { Pagination } from "../../components/explorer/Pagination";
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
      blockfrostFetch<{ json_metadata?: unknown }>(
        `/api/v0/governance/proposals/${encodeURIComponent(row.id)}/metadata`,
      ),
    staleTime: 300_000,
    retry: false,
  });
  const title = governanceName(metadata.data?.json_metadata);
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
        {title ?? row.governance_type.replaceAll("_", " ")}{" "}
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
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const health = useNodeHealth();
  const proposals = useQuery({
    queryKey: ["dingo", "proposals", "lifecycle", page],
    queryFn: async ({ signal }) => {
      const summaries = await blockfrostFetch<ProposalSummary[]>(
        `/api/v0/governance/proposals?page=${page}&count=20&order=desc`,
        { signal },
      );
      return Promise.all(summaries.map((row) => blockfrostFetch<Proposal>(
        `/api/v0/governance/proposals/${encodeURIComponent(row.id)}`,
        { signal },
      )));
    },
    refetchInterval: 15_000,
  });
  const rows = (proposals.isError ? [] : proposals.data ?? []).filter((row) =>
    showInactive || (health.data?.isHealthy === true && !health.isError && Number.isSafeInteger(row.expiration) &&
      !votingClosed(row, health.data.tipEpoch)),
  );
  const committee = useQuery({
    queryKey: ["dingo", "committee"],
    queryFn: () => blockfrostFetch<Committee>("/api/v0/governance/committee"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="The next chapter is on chain"
        title="Governance"
        detail="Proposals, votes, and the people entrusted with the protocol."
        symbol="§"
      />
      <Panel title="Governance proposals">
        <label className="survey-check survey-note">
          <input type="checkbox" checked={showInactive} onChange={(event) => {
            setShowInactive(event.target.checked);
            setPage(1);
          }} />
          Show inactive proposals
        </label>
        <QueryState hasData={proposals.data !== undefined} isLoading={proposals.isLoading} error={proposals.error}>
          {!showInactive && <p className="tool-help">Only proposals still open for voting are shown.</p>}
          {!showInactive && health.isError && <p role="alert">Unable to verify the current epoch. Retry when the node is available.</p>}
          {rows.length > 0 && (
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
          {!proposals.isLoading && !proposals.isError && rows.length === 0 && (
            <p className="list-empty">{showInactive ? "No governance proposals on this page." : "No proposals verified as active on this page."}</p>
          )}
          <ul className="activity-list">{rows.map((row) => <li key={row.id}><ProposalCard row={row} /></li>)}</ul>
        </QueryState>
        <Pagination page={page} onPageChange={setPage} hasNextPage={proposals.data?.length === 20} />
      </Panel>
      <Panel title="Constitutional committee">
        <QueryState hasData={committee.data !== undefined} isLoading={committee.isLoading} error={committee.error}>
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
  const { hash } = useLocation();
  const path = `/api/v0/governance/proposals/${encodeURIComponent(id ?? "")}`;
  const proposal = useQuery({
    queryKey: ["dingo", "proposal", id],
    queryFn: () => blockfrostFetch<Proposal>(path),
    enabled: Boolean(id),
    refetchInterval: 60000,
  });
  const record = proposal.error instanceof BlockfrostError && proposal.error.status === 404
    ? undefined
    : proposal.data;
  const loadedId = record?.id;
  useEffect(() => {
    if (loadedId && hash === "#holder-answer")
      document
        .getElementById("holder-answer")
        ?.scrollIntoView({ block: "start" });
  }, [loadedId, hash]);

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
        title="Governance action"
        symbol="§"
      />
      <Panel
        title="Governance proposal"
        action={
          record && (
            <a href="#drep-vote" className="text-xs text-teal-300">
              DRep voting ↓
            </a>
          )
        }
      >
        <QueryState hasData={record !== undefined}
          isLoading={proposal.isLoading}
          error={proposal.error}
          notFoundLabel="Proposal not found."
        >
          {record && (
            <div>
              <div className="metric-grid mb-5">
                <Metric
                  label="Deposit"
                  value={formatAda(BigInt(record.deposit))}
                />
                <Metric
                  label="Expires"
                  value={`Epoch ${record.expiration}`}
                />
                <Metric
                  label="Status"
                  value={
                    record.enacted_epoch !== null
                      ? "Enacted"
                      : record.dropped_epoch !== null
                        ? "Dropped"
                        : record.expired_epoch !== null
                          ? "Expired"
                          : record.ratified_epoch !== null
                            ? "Ratified"
                            : "Submitted"
                  }
                />
              </div>
              <Field label="ID" value={record.id} />
              <Field label="Type" value={record.governance_type} />
              <Field
                label="Transaction"
                value={<HashLink kind="tx" id={record.tx_hash} />}
              />
              <Field
                label="Certificate index"
                value={record.cert_index}
              />

              <Field
                label="Return account"
                value={
                  <HashLink kind="account" id={record.return_address} />
                }
              />

              <div className="my-6">
                <Timeline
                  items={[
                    {
                      label: "Submitted",
                      complete: true,
                      detail: <HashLink kind="tx" id={record.tx_hash} />,
                    },
                    {
                      label: "Ratified",
                      complete: record.ratified_epoch !== null,
                      detail:
                        record.ratified_epoch === null
                          ? "Not ratified"
                          : `Epoch ${record.ratified_epoch}`,
                    },
                    {
                      label: "Enacted",
                      complete: record.enacted_epoch !== null,
                      detail:
                        record.enacted_epoch === null
                          ? "Not enacted"
                          : `Epoch ${record.enacted_epoch}`,
                    },
                    {
                      label:
                        record.dropped_epoch !== null
                          ? "Dropped"
                          : "Expiration",
                      complete:
                        record.expired_epoch !== null ||
                        record.dropped_epoch !== null,
                      detail: `Epoch ${record.dropped_epoch ?? record.expired_epoch ?? record.expiration}`,
                    },
                  ]}
                />
              </div>
              <details className="detail-disclosure">
                <summary>Governance action data</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(
                    record.governance_description,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}
        </QueryState>
      </Panel>
      {record && <HolderAnswer proposal={record} />}
      {record && <ProposalVoting proposal={record} />}
      {record && <HolderResults proposal={record} />}
      {record && <GovernanceChamber proposalId={id!} />}
    </div>
  );
}
