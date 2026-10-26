import { governanceName } from "../../lib/governanceMetadata";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { HashLink } from "../../components/explorer/HashLink";
import { shortenHash } from "../../lib/format";
import { PageIntro } from "../../components/explorer/Visuals";
import { Metric, Timeline, BarChart } from "../../components/explorer/Visuals";
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
  return (
    <div className="detail-showcase flex flex-col gap-4">
      <PageIntro
        eyebrow="A voice in the network"
        title={
          governanceName(metadataQuery.data?.json_metadata) ||
          "Delegated representative"
        }
        symbol="◈"
      />
      <Panel title="DRep">
        <QueryState
          isLoading={drepQuery.isLoading}
          error={drepQuery.error}
          notFoundLabel="DRep not found."
        >
          {drepQuery.data && (
            <div>
              <div className="metric-grid mb-6">
                <Metric
                  label="Voting power"
                  value={formatAda(BigInt(drepQuery.data.amount))}
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
              </div>
              <Timeline
                items={[
                  {
                    label: "Active epoch",
                    complete: drepQuery.data.active_epoch !== null,
                    detail: drepQuery.data.active_epoch ?? "Not recorded",
                  },
                  {
                    label: "Last activity",
                    complete: drepQuery.data.last_active_epoch !== null,
                    detail: drepQuery.data.last_active_epoch ?? "Not recorded",
                  },
                ]}
              />
              <Field label="DRep ID" value={drepQuery.data.drep_id} />
              <Field label="Credential hex" value={drepQuery.data.hex} />

              <Field
                label="Script-based"
                value={drepQuery.data.has_script ? "Yes" : "No"}
              />
            </div>
          )}
        </QueryState>
      </Panel>{" "}
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
              <span className="eyebrow">Delegators on this page · ADA</span>
              <BarChart
                title="ADA delegated"
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
              <strong>{formatAda(BigInt(row.amount))}</strong>
            </>
          )}
        />
      </Panel>
    </div>
  );
}
