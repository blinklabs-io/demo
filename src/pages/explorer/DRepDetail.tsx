import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { formatAda } from "../../lib/format";

interface DRepResponse {
  drep_id: string;
  hex: string;
  amount: string;
  active: boolean;
  active_epoch: number | null;
  has_script: boolean;
  retired: boolean;
  expired: boolean;
  last_active_epoch: number | null;
}

export default function DRepDetail() {
  const { drepId } = useParams();

  const drepQuery = useQuery({
    queryKey: ["dingo", "drep", drepId],
    queryFn: () =>
      blockfrostFetch<DRepResponse>(`/api/v0/governance/dreps/${drepId}`),
    enabled: Boolean(drepId),
  });

  return (
    <Panel title="DRep">
      <QueryState
        isLoading={drepQuery.isLoading}
        error={drepQuery.error}
        notFoundLabel="DRep not found."
      >
        {drepQuery.data && (
          <div>
            <Field label="DRep ID" value={drepQuery.data.drep_id} />
            <Field label="Credential hex" value={drepQuery.data.hex} />
            <Field
              label="Voting power"
              value={formatAda(BigInt(drepQuery.data.amount))}
            />
            <Field label="Active" value={drepQuery.data.active ? "Yes" : "No"} />
            {drepQuery.data.active_epoch !== null && (
              <Field label="Active epoch" value={drepQuery.data.active_epoch} />
            )}
            <Field
              label="Script-based"
              value={drepQuery.data.has_script ? "Yes" : "No"}
            />
            <Field label="Retired" value={drepQuery.data.retired ? "Yes" : "No"} />
            <Field label="Expired" value={drepQuery.data.expired ? "Yes" : "No"} />
            {drepQuery.data.last_active_epoch !== null && (
              <Field
                label="Last active epoch"
                value={drepQuery.data.last_active_epoch}
              />
            )}
          </div>
        )}
      </QueryState>
    </Panel>
  );
}
