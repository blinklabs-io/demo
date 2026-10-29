import { AssetDistribution } from "../../components/chain/AssetDistribution";
import { ChainMark } from "../../components/explorer/ChainMark";
import { PageIntro } from "../../components/explorer/Visuals";
import { Metric } from "../../components/explorer/Visuals";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
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

  return (
    <div className="flex flex-col gap-4 detail-showcase">
      <PageIntro
        eyebrow="Native to the chain"
        title={assetQuery.data?.asset_name_ascii || "Asset explorer"}
        symbol={<ChainMark value={assetId ?? ""} />}
      />
      <Panel title="Asset">
        <QueryState
          isLoading={assetQuery.isLoading}
          error={assetQuery.error}
          notFoundLabel="Asset not found."
        >
          {assetQuery.data && (
            <div>
              <div className="metric-grid mb-6">
                <Metric
                  label="Issued supply"
                  value={BigInt(assetQuery.data.quantity).toLocaleString()}
                />
                <Metric
                  label="Mint / burn events"
                  value={assetQuery.data.mint_or_burn_count}
                />
              </div>
              <details className="technical-details">
                <summary>Policy, mint & metadata</summary>
                <div className="record-grid">
                  {" "}
                  <Field label="Asset ID" value={assetQuery.data.asset} />
                  <Field
                    label="Policy ID"
                    value={
                      <Link
                        className="text-teal-300 hover:underline"
                        to={`/explorer/policy/${assetQuery.data.policy_id}`}
                      >
                        {assetQuery.data.policy_id}
                      </Link>
                    }
                  />
                  <Field
                    label="Fingerprint"
                    value={assetQuery.data.fingerprint}
                  />
                  <Field
                    label="Mint tx"
                    value={
                      <HashLink
                        kind="tx"
                        id={assetQuery.data.initial_mint_tx_hash}
                        full
                      />
                    }
                  />
                  {assetQuery.data.onchain_metadata != null && (
                    <Field
                      label="On-chain metadata"
                      value={
                        <details>
                          <summary>View metadata</summary>
                          <pre className="whitespace-pre-wrap break-all text-xs text-slate-300">
                            {JSON.stringify(
                              assetQuery.data.onchain_metadata,
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      }
                    />
                  )}
                </div>
              </details>
            </div>
          )}
        </QueryState>
      </Panel>

      {assetQuery.data && (
        <AssetDistribution
          assetId={assetId!}
          supply={BigInt(assetQuery.data.quantity)}
        />
      )}
    </div>
  );
}
