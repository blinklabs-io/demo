import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";

interface BlockSummary {
  time: number;
  height: number;
  hash: string;
  slot: number;
  epoch: number;
  tx_count: number;
  previous_block: string;
}

const RECENT_BLOCK_COUNT = 10;

async function fetchRecentBlocks(): Promise<BlockSummary[]> {
  const latest = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest");
  const blocks: BlockSummary[] = [latest];
  let cursor = latest.previous_block;
  while (blocks.length < RECENT_BLOCK_COUNT && cursor) {
    const block = await blockfrostFetch<BlockSummary>(
      `/api/v0/blocks/${cursor}`,
    );
    blocks.push(block);
    cursor = block.previous_block;
  }
  return blocks;
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

export default function ExplorerOverview() {
  const blocksQuery = useQuery({
    queryKey: ["dingo", "recent-blocks"],
    queryFn: fetchRecentBlocks,
    refetchInterval: 20_000,
  });
  const latestTxsQuery = useQuery({
    queryKey: ["dingo", "latest-block-txs"],
    queryFn: () => blockfrostFetch<string[]>("/api/v0/blocks/latest/txs"),
    refetchInterval: 20_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          to="/explorer/pools"
          className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600"
        >
          Stake pools
        </Link>
        <Link
          to="/explorer/dreps"
          className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600"
        >
          DReps
        </Link>
        <Link
          to="/explorer/epoch"
          className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600"
        >
          Current epoch
        </Link>
        <Link
          to="/wallet"
          className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600"
        >
          Wallet
        </Link>
      </div>

      <Panel title="Recent blocks">
        <QueryState
          isLoading={blocksQuery.isLoading}
          error={blocksQuery.error}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Height</th>
                <th className="pb-2">Hash</th>
                <th className="pb-2">Epoch</th>
                <th className="pb-2">Txs</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {blocksQuery.data?.map((block) => (
                <tr key={block.hash} className="border-t border-slate-800">
                  <td className="py-1.5">
                    <HashLink kind="block" id={String(block.height)} />
                  </td>
                  <td className="py-1.5">
                    <HashLink kind="block" id={block.hash} />
                  </td>
                  <td className="py-1.5 text-slate-400">{block.epoch}</td>
                  <td className="py-1.5 text-slate-400">{block.tx_count}</td>
                  <td className="py-1.5 text-slate-400">
                    {formatTime(block.time)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </QueryState>
      </Panel>

      <Panel title="Latest block transactions">
        <QueryState
          isLoading={latestTxsQuery.isLoading}
          error={latestTxsQuery.error}
        >
          {latestTxsQuery.data && latestTxsQuery.data.length === 0 && (
            <p className="text-sm text-slate-500">
              No transactions in the latest block.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {latestTxsQuery.data?.map((hash) => (
              <li key={hash}>
                <HashLink kind="tx" id={hash} visible={16} />
              </li>
            ))}
          </ul>
        </QueryState>
      </Panel>
    </div>
  );
}
