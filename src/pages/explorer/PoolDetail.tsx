import { PoolProducer } from "../../components/explorer/PoolProducer";
import { PoolMetadataPanel } from "../../components/explorer/PoolMetadataPanel";
import { PoolDelegators } from "../../components/explorer/PoolDelegators";
import { PoolRelays } from "../../components/explorer/PoolRelays";
import { Metric } from "../../components/explorer/Visuals";
import { CopyButton } from "../../components/explorer/CopyButton";
import { PoolAvatar } from "../../components/explorer/PoolIdentity";
import { compactAda } from "../../lib/visualFormat";
import { useParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { formatNativeCoin } from "../../lib/format";

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
  hash?: string;
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

  const notFound =
    poolQuery.error instanceof BlockfrostError &&
    poolQuery.error.status === 404;

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <header className="detail-header">
        <div className="pool-hero">
          {poolId && (
            <PoolAvatar
              key={`${poolId}:${metadataQuery.data?.hash ?? ""}`}
              poolId={poolQuery.data?.pool_id ?? poolId}
              metadata={metadataQuery.data}
            />
          )}
          <h1>
            {metadataQuery.data?.ticker
              ? `${metadataQuery.data.ticker} `
              : ""}
            {metadataQuery.data?.name || "Stake pool"}
          </h1>
          {poolId && (
            <p className="detail-id">
              <code>{poolQuery.data?.pool_id ?? poolId}</code>
              <CopyButton
                value={poolQuery.data?.pool_id ?? poolId}
                label="pool ID"
              />
            </p>
          )}
          {metadataQuery.data?.description && (
            <p className="detail-summary">{metadataQuery.data.description}</p>
          )}
        </div>
        {poolId && !notFound && poolQuery.data && (
          <Link
            className="experience-primary"
            to={`/wallet/delegate?pool=${encodeURIComponent(poolQuery.data.pool_id)}`}
          >
            Delegate to this pool
          </Link>
        )}
      </header>
      <QueryState
        hasData={poolQuery.data !== undefined}
        isLoading={poolQuery.isLoading}
        error={poolQuery.error}
        notFoundLabel="Pool not found."
      >
        {poolQuery.data && (
          <div className="metric-grid">
            <Metric
              label="Live stake"
              value={compactAda(poolQuery.data.live_stake)}
              detail={formatNativeCoin(BigInt(poolQuery.data.live_stake))}
            />
            <Metric
              label="Saturation"
              value={`${(poolQuery.data.live_saturation * 100).toFixed(1)}%`}
              detail={
                poolQuery.data.live_saturation > 1
                  ? "Oversaturated"
                  : "Of the saturation threshold"
              }
            />
            <Metric
              label="Delegators"
              value={poolQuery.data.live_delegators.toLocaleString()}
            />
            <Metric
              label="Blocks minted"
              value={poolQuery.data.blocks_minted.toLocaleString()}
              detail={`${poolQuery.data.blocks_epoch.toLocaleString()} this epoch`}
            />
            <Metric
              label="Margin"
              value={`${(poolQuery.data.margin_cost * 100).toFixed(2)}%`}
              detail={`Plus ${formatNativeCoin(BigInt(poolQuery.data.fixed_cost))} fixed`}
            />
          </div>
        )}
      </QueryState>
      <Panel title="Details">
        <QueryState
          hasData={poolQuery.data !== undefined}
          isLoading={poolQuery.isLoading}
          error={null}
        >
          {poolQuery.data && (
            <div className="field-grid">
              <PoolProducer
                key={poolQuery.data.pool_id}
                poolId={poolQuery.data.pool_id}
              />
              <Field label="Pool key hash (hex)" value={poolQuery.data.hex} />

              <Field
                label="Active stake"
                value={formatNativeCoin(BigInt(poolQuery.data.active_stake))}
              />
              <Field
                label="Declared pledge"
                value={formatNativeCoin(BigInt(poolQuery.data.declared_pledge))}
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
                  <ul className="flex flex-col gap-1">
                    {poolQuery.data.owners.map((owner) => (
                      <li key={owner}>
                        <HashLink kind="account" id={owner} />
                      </li>
                    ))}
                  </ul>
                }
              />
            </div>
          )}
        </QueryState>
      </Panel>
      {poolQuery.data && !notFound && (
        <>
          <PoolRelays poolId={poolQuery.data.pool_id} />
          <PoolDelegators
            key={poolQuery.data.pool_id}
            poolId={poolQuery.data.pool_id}
          />
          <PoolMetadataPanel
            metadata={metadataQuery.data}
            isLoading={metadataQuery.isLoading}
            error={metadataQuery.error}
          />
        </>
      )}
    </div>
  );
}
