import { useQuery } from "@tanstack/react-query";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { formatAda } from "../../lib/format";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";

interface PoolExtendedRow {
  pool_id: string;
  active_stake: string;
  live_stake: string;
  blocks_minted: number;
  live_saturation: number;
  margin_cost: number;
}

interface PoolMetadata {
  ticker?: string;
  name?: string;
}

function PoolRow({ row }: { row: PoolExtendedRow }) {
  const { data: metadata } = useQuery({
    queryKey: ["dingo", "pool", row.pool_id, "metadata"],
    queryFn: () =>
      blockfrostFetch<PoolMetadata>(`/api/v0/pools/${row.pool_id}/metadata`),
    retry: false,
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2">
      <span>
        <HashLink kind="pool" id={row.pool_id} visible={10} />
        {metadata?.ticker && (
          <span className="ml-2 text-slate-400">[{metadata.ticker}]</span>
        )}
        {metadata?.name && (
          <span className="ml-2 text-slate-500">{metadata.name}</span>
        )}
      </span>
      <span className="text-xs text-slate-500">
        {formatAda(BigInt(row.live_stake))} live ·{" "}
        {(row.live_saturation * 100).toFixed(1)}% saturated · {row.blocks_minted}{" "}
        blocks · {(row.margin_cost * 100).toFixed(1)}% margin
      </span>
    </div>
  );
}

interface PoolRetiringRow {
  pool_id: string;
  epoch: number;
}

export default function PoolList() {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Stake pools">
        <PaginatedList<PoolExtendedRow>
          queryKey={["dingo", "pools", "extended"]}
          buildUrl={(page, count) =>
            `/api/v0/pools/extended?page=${page}&count=${count}`
          }
          keyFor={(row) => row.pool_id}
          emptyLabel="No pools found."
          renderItem={(row) => <PoolRow row={row} />}
        />
      </Panel>

      <Panel title="Retiring pools">
        <PaginatedList<PoolRetiringRow>
          queryKey={["dingo", "pools", "retiring"]}
          buildUrl={(page, count) =>
            `/api/v0/pools/retiring?page=${page}&count=${count}`
          }
          keyFor={(row) => row.pool_id}
          emptyLabel="No pools are retiring."
          renderItem={(row) => (
            <span>
              <HashLink kind="pool" id={row.pool_id} visible={10} /> retiring at
              epoch {row.epoch}
            </span>
          )}
        />
      </Panel>
    </div>
  );
}
