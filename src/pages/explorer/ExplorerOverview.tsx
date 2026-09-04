import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { QueryState } from "../../components/explorer/QueryState";
import { useMempoolStore } from "../../stores/mempoolStore";

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

interface RecentBlocksResult {
  blocks: BlockSummary[];
  incomplete: boolean;
}

async function fetchRecentBlocks(): Promise<RecentBlocksResult> {
  const latest = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest");
  const blocks: BlockSummary[] = [latest];
  let cursor = latest.previous_block;
  while (blocks.length < RECENT_BLOCK_COUNT && cursor) {
    let block: BlockSummary;
    try {
      block = await blockfrostFetch<BlockSummary>(`/api/v0/blocks/${cursor}`);
    } catch {
      return { blocks, incomplete: true };
    }
    blocks.push(block);
    cursor = block.previous_block;
  }
  return { blocks, incomplete: false };
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

async function fetchLatestBlockTransactions(): Promise<string[]> {
  const before = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest");
  const txs = await blockfrostFetch<string[]>("/api/v0/blocks/latest/txs");
  const after = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest");
  if (before.hash !== after.hash) {
    throw new Error("The latest block changed while loading its transactions.");
  }
  return txs;
}

export default function ExplorerOverview() {
  const pendingCount = useMempoolStore((state) => state.pendingTxs.size);
  const mempoolStatus = useMempoolStore((state) => state.status);

  const blocksQuery = useQuery({
    queryKey: ["dingo", "recent-blocks"],
    queryFn: fetchRecentBlocks,
    refetchInterval: 20_000,
  });
  const latestTxsQuery = useQuery({
    queryKey: ["dingo", "latest-block-txs"],
    queryFn: fetchLatestBlockTransactions,
    refetchInterval: 20_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Link
          to="/explorer/mempool"
          className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600"
        >
          Mempool
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
              mempoolStatus === "live"
                ? "bg-emerald-950 text-emerald-300"
                : "bg-slate-800 text-slate-500"
            }`}
          >
            {mempoolStatus === "live" ? pendingCount : "…"}
          </span>
        </Link>
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
          {blocksQuery.data?.incomplete && (
            <p className="mb-3 text-sm text-amber-300" role="status">
              Recent block history is incomplete. Some older blocks could not
              be loaded.
            </p>
          )}
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
              {blocksQuery.data?.blocks.map((block) => (
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
          {latestTxsQuery.data?.length === 0 && (
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
