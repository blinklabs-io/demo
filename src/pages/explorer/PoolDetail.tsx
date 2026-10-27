import { PoolIdentity } from "../../components/explorer/PoolIdentity";
import { Gauge, Metric, PageIntro } from "../../components/explorer/Visuals";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { formatAda } from "../../lib/format";

interface PoolDetailResponse {
  pool_id: string;
  hex: string;
  vrf_key: string;
  blocks_minted: number;
  blocks_epoch: number;
  live_stake: string;
  live_saturation: number;
  live_delegators: number;
  active_stake: string;
  declared_pledge: string;
  margin_cost: number;
  fixed_cost: string;
  reward_account: string;
  owners: string[];
}

interface PoolMetadataResponse {
  ticker?: string;
  name?: string;
  description?: string;
  homepage?: string;
  url?: string;
}

export default function PoolDetail() {
  const { poolId } = useParams();

  const poolQuery = useQuery({
    queryKey: ["dingo", "pool", poolId],
    queryFn: () =>
      blockfrostFetch<PoolDetailResponse>(`/api/v0/pools/${poolId}`),
    enabled: Boolean(poolId),
  });

  const metadataQuery = useQuery({
    queryKey: ["dingo", "pool", poolId, "metadata"],
    queryFn: () =>
      blockfrostFetch<PoolMetadataResponse>(`/api/v0/pools/${poolId}/metadata`),
    enabled: Boolean(poolId),
  });

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <PageIntro
        eyebrow="The block makers"
        title={metadataQuery.data?.name || "Stake pool"}
        detail={metadataQuery.data?.description}
        symbol="⬡"
      />
      <Panel
        title={
          poolId ? (
            <PoolIdentity poolId={poolId} metadata={metadataQuery.data} />
          ) : (
            "Stake pool"
          )
        }
      >
        <QueryState
          isLoading={poolQuery.isLoading}
          error={poolQuery.error}
          notFoundLabel="Pool not found."
        >
          {poolQuery.data && (
            <div>
              <div className="pool-overview">
                <div className="metric-grid">
                  <Metric
                    label="Live stake"
                    value={formatAda(BigInt(poolQuery.data.live_stake))}
                  />
                  <Metric
                    label="Delegators"
                    value={poolQuery.data.live_delegators.toLocaleString()}
                  />
                  <Metric
                    label="Blocks minted"
                    value={poolQuery.data.blocks_minted.toLocaleString()}
                  />
                </div>
                <div className="pool-instrument">
                  <Gauge
                    label="Pool saturation"
                    value={poolQuery.data.live_saturation * 100}
                    detail="Share of saturation threshold"
                  />
                </div>
              </div>
              <Field label="Pool ID" value={poolQuery.data.pool_id} />
              {metadataQuery.data?.homepage && (
                <Field
                  label="Homepage"
                  value={
                    <a
                      href={metadataQuery.data.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      {metadataQuery.data.homepage}
                    </a>
                  }
                />
              )}

              <Field
                label="Active stake"
                value={formatAda(BigInt(poolQuery.data.active_stake))}
              />
              <Field
                label="Declared pledge"
                value={formatAda(BigInt(poolQuery.data.declared_pledge))}
              />
              <Field
                label="Margin / fixed cost"
                value={`${(poolQuery.data.margin_cost * 100).toFixed(2)}% + ${formatAda(BigInt(poolQuery.data.fixed_cost))}`}
              />

              <Field
                label="Blocks this epoch"
                value={poolQuery.data.blocks_epoch}
              />
              <Field
                label="Reward account"
                value={
                  <HashLink
                    kind="account"
                    id={poolQuery.data.reward_account}
                    full
                  />
                }
              />
              <Field label="VRF key" value={poolQuery.data.vrf_key} />
              <Field
                label="Owners"
                value={
                  <ul className="flex flex-col gap-0.5">
                    {poolQuery.data.owners.map((owner) => (
                      <li key={owner}>
                        <HashLink kind="account" id={owner} visible={12} />
                      </li>
                    ))}
                  </ul>
                }
              />
            </div>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
