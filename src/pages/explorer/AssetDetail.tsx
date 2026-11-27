import { ChainMark } from "../../components/explorer/ChainMark";
import { CopyButton } from "../../components/explorer/CopyButton";
import { AssetDistribution } from "../../components/chain/AssetDistribution";
import { OutputHistory } from "../../components/explorer/OutputHistory";
import { Metric } from "../../components/explorer/Visuals";
import { useParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";

interface AssetResponse {
  asset: string;
  policy_id: string;
  asset_name: string;
  asset_name_ascii: string;
  fingerprint: string;
  quantity: string;
  initial_mint_tx_hash: string;
  mint_or_burn_count: number;
  onchain_metadata: unknown;
}

export default function AssetDetail() {
  const { assetId } = useParams();

  const assetQuery = useQuery({
    queryKey: ["dingo", "asset", assetId],
    queryFn: () => blockfrostFetch<AssetResponse>(`/api/v0/assets/${assetId}`),
    enabled: Boolean(assetId),
  });

  const asset = assetQuery.error instanceof BlockfrostError && assetQuery.error.status === 404
    ? undefined
    : assetQuery.data;

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <header className="detail-header">
        <div className="detail-identity">
          {assetId && <span className="detail-mark"><ChainMark value={asset?.asset ?? assetId} /></span>}
          <h1>{asset?.asset_name_ascii || "Asset"}</h1>
          {assetId && (
            <p className="detail-id">
              <code>{asset?.asset ?? assetId}</code>
              <CopyButton value={asset?.asset ?? assetId} label="asset ID" />
            </p>
          )}
        </div>
      </header>
      <QueryState
        hasData={asset !== undefined}
        isLoading={assetQuery.isLoading}
        error={assetQuery.error}
        notFoundLabel="Asset not found."
      >
        {asset && (
          <>
            <div className="metric-grid">
              <Metric
                label="Issued supply"
                value={BigInt(asset.quantity).toLocaleString()}
                detail="Base units"
              />
              <Metric
                label="Mint and burn events"
                value={asset.mint_or_burn_count}
              />
            </div>
            <Panel title="Details">
              <div className="field-grid">
                <Field
                  label="Policy ID"
                  value={
                    <span className="address-identifier address-identifier-full">
                      <Link to={`/explorer/policy/${asset.policy_id}`}>
                        {asset.policy_id}
                      </Link>
                      <CopyButton value={asset.policy_id} label="policy ID" />
                    </span>
                  }
                />
                <Field label="Fingerprint" value={asset.fingerprint} />
                <Field
                  label="First mint transaction"
                  value={
                    <HashLink kind="tx" id={asset.initial_mint_tx_hash} full />
                  }
                />
              </div>
              {asset.onchain_metadata != null && (
                <details className="technical-details">
                  <summary>On-chain metadata</summary>
                  <pre className="record-json">
                    {JSON.stringify(asset.onchain_metadata, null, 2)}
                  </pre>
                </details>
              )}
            </Panel>
          </>
        )}
      </QueryState>

      {asset && (
        <AssetDistribution
          assetId={assetId!}
          supply={BigInt(asset.quantity)}
        />
      )}
      {asset && <OutputHistory pattern={`${asset.policy_id}.${asset.asset_name}`} />}
    </div>
  );
}
