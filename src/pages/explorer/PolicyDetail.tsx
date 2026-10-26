import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { hexToBytes } from "../../lib/dingo/utxorpc/bytes";
import { shortenHash } from "../../lib/format";
import { ChainMark } from "../../components/explorer/ChainMark";
import { EmptyState, PageIntro } from "../../components/explorer/Visuals";
import { Panel } from "../../components/explorer/Panel";
import { Pagination } from "../../components/explorer/Pagination";
import { QueryState } from "../../components/explorer/QueryState";

interface PolicyAsset {
  asset: string;
  quantity: string;
}
function assetName(asset: string): string {
  const name = asset.slice(56);
  if (!name) return "Unnamed asset";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      hexToBytes(name),
    );
    if (
      [...text].some((char) => {
        const code = char.codePointAt(0)!;
        return code < 32 || (code >= 127 && code <= 159);
      })
    )
      return `Asset ${shortenHash(name, 8)}`;
    return text.trim() ? text : `Asset ${shortenHash(name, 8)}`;
  } catch {
    return `Asset ${shortenHash(name, 8)}`;
  }
}

export default function PolicyDetail() {
  const { policyId: raw } = useParams();
  const policyId = raw?.toLowerCase();
  if (!policyId || !/^[0-9a-f]{56}$/.test(policyId))
    return (
      <Panel>
        <EmptyState
          icon="⌕"
          title="Invalid policy ID"
          detail="A minting policy ID contains 56 hexadecimal characters."
        />
      </Panel>
    );
  return <PolicyAssets key={policyId} policyId={policyId} />;
}

function PolicyAssets({ policyId }: { policyId: string }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const assets = useQuery({
    queryKey: ["dingo", "policy-assets", policyId, page],
    queryFn: async ({ signal }) => {
      const rows = await blockfrostFetch<PolicyAsset[]>(
        `/api/v0/assets/policy/${policyId}?page=${page}&count=20&order=asc`,
        { signal },
      );
      if (
        rows.some(
          (row) =>
            !row.asset.startsWith(policyId) ||
            !/^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/.test(row.asset),
        )
      )
        throw new Error("Dingo returned an asset outside this policy.");
      return rows;
    },
    staleTime: 300_000,
    retry: false,
  });
  const query = filter.trim().toLowerCase();
  const visible =
    assets.data?.filter(
      (row) =>
        !query ||
        row.asset.includes(query) ||
        assetName(row.asset).toLowerCase().includes(query),
    ) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Native assets · minting policy"
        title="One policy. Its assets."
        symbol={<ChainMark value={policyId} />}
      />
      <section className="policy-identity">
        <span className="eyebrow">Policy ID</span>
        <code>{policyId}</code>
        <p>Browse native assets minted under this policy.</p>
      </section>
      <Panel
        title="Policy assets"
        action={<span className="text-xs text-slate-400">Page {page}</span>}
      >
        <label className="directory-search">
          <span className="text-xs text-slate-400">
            Filter this page by asset name or ID
          </span>
          <input
            type="search"
            aria-label="Filter policy assets on this page"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Asset name or hex…"
          />
        </label>
        <QueryState
          isLoading={assets.isLoading}
          error={assets.error}
          notFoundLabel="No assets found under this policy."
        >
          {assets.isSuccess && (
            <>
              <p className="my-4 text-xs text-slate-500">
                {visible.length} of {assets.data.length} assets on this page ·
                quantities are base units.
              </p>
              {visible.length ? (
                <div className="policy-asset-grid">
                  {visible.map((row) => (
                    <Link
                      className="policy-asset-card"
                      key={row.asset}
                      to={`/explorer/asset/${row.asset}`}
                    >
                      <ChainMark value={row.asset} />
                      <div>
                        <h3>{assetName(row.asset)}</h3>
                        <code title={row.asset}>
                          {row.asset.slice(56) || "Empty asset name"}
                        </code>
                        <span>
                          Supply{" "}
                          <strong>
                            {BigInt(row.quantity).toLocaleString()}
                          </strong>
                        </span>
                      </div>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="◇"
                  title={
                    query ? "No matches on this page" : "No assets on this page"
                  }
                  detail={
                    query
                      ? "Try another filter or browse another page."
                      : "Dingo returned no asset records for this policy page."
                  }
                />
              )}
              <Pagination
                page={page}
                onPageChange={setPage}
                hasNextPage={assets.data.length === 20}
              />
            </>
          )}
        </QueryState>
        {assets.isError && (
          <button
            className="mt-3 text-xs text-teal-300"
            type="button"
            onClick={() => void assets.refetch()}
          >
            Retry policy lookup
          </button>
        )}
      </Panel>
    </div>
  );
}
