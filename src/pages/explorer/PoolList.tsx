import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { PaginatedList } from "../../components/explorer/PaginatedList";
import { formatAda } from "../../lib/format";

interface PoolExtendedRow {
  pool_id: string;
  active_stake: string;
  live_stake: string;
  blocks_minted: number;
  live_saturation: number;
  margin_cost: number;
  metadata: { ticker?: string; name?: string } | null;
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
          renderItem={(row) => (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2">
              <span>
                <HashLink kind="pool" id={row.pool_id} visible={10} />
                {row.metadata?.ticker && (
                  <span className="ml-2 text-slate-400">
                    [{row.metadata.ticker}]
                  </span>
                )}
                {row.metadata?.name && (
                  <span className="ml-2 text-slate-500">{row.metadata.name}</span>
                )}
              </span>
              <span className="text-xs text-slate-500">
                {formatAda(BigInt(row.live_stake))} live ·{" "}
                {(row.live_saturation * 100).toFixed(1)}% saturated ·{" "}
                {row.blocks_minted} blocks ·{" "}
                {(row.margin_cost * 100).toFixed(1)}% margin
              </span>
            </div>
          )}
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
