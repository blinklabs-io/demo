import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { HashLink } from "../../components/explorer/HashLink";
import { formatAda } from "../../lib/format";

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

interface ProposalVote {
  tx_hash: string;
  cert_index: number;
  voter_role: string;
  voter: string;
  vote: string;
  counted: boolean;
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

export default function Governance() {
  const committee = useQuery({
    queryKey: ["dingo", "committee"],
    queryFn: () => blockfrostFetch<Committee>("/api/v0/governance/committee"),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-white">Governance</h1>
      <Panel title="Proposals">
        <PaginatedList<ProposalSummary>
          queryKey={["dingo", "proposals"]}
          buildUrl={(page, count) => `/api/v0/governance/proposals?page=${page}&count=${count}&order=desc`}
          keyFor={(row) => row.id}
          emptyLabel="No governance proposals."
          renderItem={(row) => (
            <div className="flex flex-wrap gap-2 py-1">
              <Link className="break-all font-mono text-sky-400 hover:underline" to={`/explorer/proposal/${encodeURIComponent(row.id)}`}>{row.id}</Link>
              <span className="text-slate-400">{row.governance_type}</span>
            </div>
          )}
        />
      </Panel>
      <Panel title="Constitutional committee">
        <QueryState isLoading={committee.isLoading} error={committee.error}>
          {committee.data && <>
            <Field label="Dissolved" value={committee.data.is_dissolved ? "Yes" : "No"} />
            <Field label="Quorum" value={`${committee.data.quorum.numerator}/${committee.data.quorum.denominator}`} />
            {committee.data.members.length === 0 && <p className="text-sm text-slate-500">No committee members.</p>}
            {committee.data.members.map((member) => (
              <div key={member.cc_cold_id} className="mt-3 break-all border-t border-slate-800 pt-3">
                <Field label="Cold credential" value={member.cc_cold_id} />
                <Field label="Hot credential" value={member.cc_hot_id ?? "—"} />
                <Field label="Status" value={member.status} />
                <Field label="Expiration epoch" value={member.expiration_epoch} />
              </div>
            ))}
          </>}
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
    <div className="flex flex-col gap-4">
      <Link to="/explorer/governance" className="text-sm text-sky-400 hover:underline">Governance proposals</Link>
      <Panel title="Governance proposal">
        <QueryState isLoading={proposal.isLoading} error={proposal.error} notFoundLabel="Proposal not found.">
          {proposal.data && <>
            <Field label="ID" value={proposal.data.id} />
            <Field label="Type" value={proposal.data.governance_type} />
            <Field label="Transaction" value={<HashLink kind="tx" id={proposal.data.tx_hash} />} />
            <Field label="Certificate index" value={proposal.data.cert_index} />
            <Field label="Deposit (ADA)" value={formatAda(BigInt(proposal.data.deposit))} />
            <Field label="Return account" value={<HashLink kind="account" id={proposal.data.return_address} />} />
            <Field label="Expiration epoch" value={proposal.data.expiration} />
            <Field label="Ratified epoch" value={proposal.data.ratified_epoch ?? "—"} />
            <Field label="Enacted epoch" value={proposal.data.enacted_epoch ?? "—"} />
            <Field label="Dropped epoch" value={proposal.data.dropped_epoch ?? "—"} />
            <Field label="Expired epoch" value={proposal.data.expired_epoch ?? "—"} />
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(proposal.data.governance_description, null, 2)}</pre>
          </>}
        </QueryState>
      </Panel>
      {proposal.data && <Panel title="Votes">
        <PaginatedList<ProposalVote>
          queryKey={["dingo", "proposal", id, "votes"]}
          buildUrl={(page, count) => `${path}/votes?page=${page}&count=${count}&order=desc`}
          keyFor={(row, index) => `${row.tx_hash}:${row.cert_index}:${row.voter}:${index}`}
          emptyLabel="No votes cast."
          renderItem={(row) => (
            <div className="break-all py-1">
              <span className="font-medium text-slate-200">{row.vote}</span> · {row.voter_role} · {row.voter} · {row.counted ? "Counted" : "Not counted"} · <HashLink kind="tx" id={row.tx_hash} />
            </div>
          )}
        />
      </Panel>}
    </div>
  );
}
