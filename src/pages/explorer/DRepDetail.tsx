import { ChainMark } from "../../components/explorer/ChainMark";
import { CopyButton } from "../../components/explorer/CopyButton";
import { governanceName } from "../../lib/governanceMetadata";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { HashLink } from "../../components/explorer/HashLink";
import { shortenHash, nativeTicker } from "../../lib/format";
import { Metric, BarChart } from "../../components/explorer/Visuals";
import { useParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { formatNativeCoin } from "../../lib/format";

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

  const metadataQuery = useQuery({
    queryKey: ["dingo", "drep", drepId, "metadata"],
    queryFn: () =>
      blockfrostFetch<{ json_metadata: unknown }>(
        `/api/v0/governance/dreps/${drepId}/metadata`,
      ),
    enabled: Boolean(drepId) && !drepId?.startsWith("drep_always_"),
    staleTime: 300_000,
    retry: false,
  });
  const notFound = drepQuery.error instanceof BlockfrostError && drepQuery.error.status === 404;
  return (
    <div className="detail-showcase flex flex-col gap-4">
      <header className="detail-header">
        <div className="detail-identity">
          {drepId && <span className="detail-mark"><ChainMark value={drepId} /></span>}
          <h1>
            {governanceName(metadataQuery.data?.json_metadata) ||
              "Delegated representative"}
          </h1>
          {drepId && (
            <p className="detail-id">
              <code>{drepId}</code>
              <CopyButton value={drepId} label="DRep ID" />
            </p>
          )}
        </div>
        {drepId && !drepId.startsWith("drep_always_") && !notFound && drepQuery.data && !drepQuery.data.retired && (
          <Link className="experience-primary" to={`/wallet/delegate?drep=${encodeURIComponent(drepId)}`}>
            Delegate voting power
          </Link>
        )}
      </header>
      <QueryState
        hasData={drepQuery.data !== undefined}
        isLoading={drepQuery.isLoading}
        error={drepQuery.error}
        notFoundLabel="DRep not found."
      >
        {drepQuery.data && (
          <>
            <div className="metric-grid">
              <Metric
                label="Voting power"
                value={formatNativeCoin(BigInt(drepQuery.data.amount))}
              />
              <Metric
                label="Status"
                value={
                  drepQuery.data.retired
                    ? "Retired"
                    : drepQuery.data.expired
                      ? "Expired"
                      : drepQuery.data.active
                        ? "Active"
                        : "Inactive"
                }
              />
              <Metric
                label="Active since epoch"
                value={drepQuery.data.active_epoch ?? "Not recorded"}
              />
              <Metric
                label="Last active epoch"
                value={drepQuery.data.last_active_epoch ?? "Not recorded"}
              />
            </div>
            <Panel title="Details">
              <div className="field-grid">
                <Field label="Credential hex" value={drepQuery.data.hex} />
                <Field
                  label="Credential type"
                  value={drepQuery.data.has_script ? "Script" : "Key"}
                />
              </div>
            </Panel>
          </>
        )}
      </QueryState>

      {!notFound && (
        <Panel title="Delegated voting power">
          <PaginatedList<{ address: string; amount: string }>
            queryKey={["dingo", "drep", drepId, "delegators"]}
            buildUrl={(page, count) =>
              `/api/v0/governance/dreps/${drepId}/delegators?page=${page}&count=${count}&order=desc`
            }
            keyFor={(row) => row.address}
            emptyLabel="No delegators recorded."
            visualize={(rows) => (
              <div className="mb-6">
                <span className="eyebrow">Delegators on this page · {nativeTicker()}</span>
                <BarChart
                  title={`${nativeTicker()} delegated`}
                  items={rows.map((row) => ({
                    label: shortenHash(row.address, 5),
                    value: Number(BigInt(row.amount)) / 1_000_000,
                    href: `/explorer/account/${row.address}`,
                  }))}
                />
              </div>
            )}
            renderItem={(row) => (
              <>
                <HashLink kind="account" id={row.address} />
                <strong>{formatNativeCoin(BigInt(row.amount))}</strong>
              </>
            )}
          />
        </Panel>
      )}
    </div>
  );
}
