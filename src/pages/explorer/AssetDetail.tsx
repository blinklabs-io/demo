import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel, Field } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { PaginatedList } from "../../components/explorer/PaginatedList";

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

interface AssetAddressRow {
  address: string;
  quantity: string;
}

export default function AssetDetail() {
  const { assetId } = useParams();

  const assetQuery = useQuery({
    queryKey: ["dingo", "asset", assetId],
    queryFn: () => blockfrostFetch<AssetResponse>(`/api/v0/assets/${assetId}`),
    enabled: Boolean(assetId),
  });

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Asset">
        <QueryState
          isLoading={assetQuery.isLoading}
          error={assetQuery.error}
          notFoundLabel="Asset not found."
        >
          {assetQuery.data && (
            <div>
              <Field label="Asset ID" value={assetQuery.data.asset} />
              <Field label="Policy ID" value={assetQuery.data.policy_id} />
              <Field
                label="Asset name"
                value={assetQuery.data.asset_name_ascii || assetQuery.data.asset_name || "—"}
              />
              <Field label="Fingerprint" value={assetQuery.data.fingerprint} />
              <Field label="Quantity" value={assetQuery.data.quantity} />
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
              <Field
                label="Mint/burn events"
                value={assetQuery.data.mint_or_burn_count}
              />
              {assetQuery.data.onchain_metadata != null && (
                <Field
                  label="On-chain metadata"
                  value={
                    <pre className="whitespace-pre-wrap break-all text-xs text-slate-300">
                      {JSON.stringify(assetQuery.data.onchain_metadata, null, 2)}
                    </pre>
                  }
                />
              )}
            </div>
          )}
        </QueryState>
      </Panel>

      <Panel title="Holder addresses">
        <PaginatedList<AssetAddressRow>
          queryKey={["dingo", "asset", assetId, "addresses"]}
          buildUrl={(page, count) =>
            `/api/v0/assets/${assetId}/addresses?page=${page}&count=${count}`
          }
          keyFor={(row) => row.address}
          emptyLabel="No holders."
          renderItem={(row) => (
            <span>
              <HashLink kind="address" id={row.address} visible={12} /> —{" "}
              {row.quantity}
            </span>
          )}
        />
      </Panel>
    </div>
  );
}
