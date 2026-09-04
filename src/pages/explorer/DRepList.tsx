import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { formatAda } from "../../lib/format";

interface DRepListRow {
  drep_id: string;
  amount: string;
  has_script: boolean;
  retired: boolean;
  expired: boolean;
}

function statusLabel(row: DRepListRow): string {
  if (row.retired) return "Retired";
  if (row.expired) return "Expired";
  return "Active";
}

export default function DRepList() {
  return (
    <Panel title="DReps">
      <PaginatedList<DRepListRow>
        queryKey={["dingo", "dreps"]}
        buildUrl={(page, count) =>
          `/api/v0/governance/dreps?page=${page}&count=${count}&order=desc`
        }
        keyFor={(row) => row.drep_id}
        emptyLabel="No DReps found."
        renderItem={(row) => (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2">
            <span>
              <HashLink kind="drep" id={row.drep_id} visible={10} />
              {row.has_script && (
                <span className="ml-2 text-xs text-slate-500">(script)</span>
              )}
            </span>
            <span className="text-xs text-slate-500">
              {formatAda(BigInt(row.amount))} · {statusLabel(row)}
            </span>
          </div>
        )}
      />
    </Panel>
  );
}
