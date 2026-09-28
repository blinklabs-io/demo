import { useState } from "react";
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
  metadata: {
    url: string;
    hash: string;
    json_metadata: unknown;
  } | null;
}

function displayName(metadata: unknown): string | undefined {
  if (metadata === null || typeof metadata !== "object") return undefined;
  const values = metadata as Record<string, unknown>;
  for (const key of ["givenName", "name"]) {
    const field = values[key];
    if (typeof field === "string" && field.trim()) return field;
    if (field && typeof field === "object" && "value" in field) {
      const value = (field as { value?: unknown }).value;
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

function safeMetadataUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function statusLabel(row: DRepListRow): string {
  if (row.retired) return "Retired";
  if (row.expired) return "Expired";
  return "Active";
}

export default function DRepList() {
  const [filter, setFilter] = useState("active");

  return (
    <Panel
      title="DReps"
      action={
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Status
          <select
            aria-label="Filter DReps"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          >
            <option value="active">Active and unexpired</option>
            <option value="all">All</option>
            <option value="retired">Retired</option>
            <option value="expired">Expired</option>
          </select>
        </label>
      }
    >
      <PaginatedList<DRepListRow>
        queryKey={["dingo", "dreps", filter]}
        buildUrl={(page, count) => {
          const params = new URLSearchParams({
            page: String(page),
            count: String(count),
            order: "desc",
            order_by: "amount",
          });
          if (filter === "active") {
            params.set("retired", "false");
            params.set("expired", "false");
          } else if (filter === "retired" || filter === "expired") {
            params.set(filter, "true");
          }
          return `/api/v0/governance/dreps?${params.toString()}`;
        }}
        keyFor={(row) => row.drep_id}
        emptyLabel="No DReps found."
        renderItem={(row) => (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2">
            <span>
              <HashLink kind="drep" id={row.drep_id} visible={10} />
              {displayName(row.metadata?.json_metadata) && (
                <span className="ml-2 text-sm text-slate-200">
                  {displayName(row.metadata?.json_metadata)}
                </span>
              )}
              {row.has_script && (
                <span className="ml-2 text-xs text-slate-500">(script)</span>
              )}
              {row.metadata?.url && safeMetadataUrl(row.metadata.url) && (
                <a
                  href={safeMetadataUrl(row.metadata.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-xs text-sky-500 hover:text-sky-300"
                >
                  CIP-119 anchor
                </a>
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
