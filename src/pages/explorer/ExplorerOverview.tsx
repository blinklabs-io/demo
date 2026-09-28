import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { HashLink } from "../../components/explorer/HashLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatAda } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { useMempoolStore } from "../../stores/mempoolStore";

interface BlockSummary {
  time: number;
  height: number;
  hash: string;
  slot: number;
  epoch: number;
  epoch_slot: number;
  tx_count: number;
  size: number;
  previous_block: string;
  slot_leader: string;
}

interface EpochResponse {
  epoch: number;
  start_time: number;
  end_time: number;
  block_count: number;
  tx_count: number;
  output: string;
  fees: string;
  active_stake: string | null;
}

interface NetworkResponse {
  supply: {
    max: string;
    total: string;
    circulating: string;
    locked: string;
    treasury: string;
    reserves: string;
  };
  stake: { live: string; active: string };
}

interface GenesisResponse {
  epoch_length: number;
  slot_length: number;
  active_slots_coefficient: number;
  network_magic: number;
  system_start: number;
  max_lovelace_supply: string;
}

interface ProtocolParamsResponse {
  epoch: number;
  min_fee_a: number;
  min_fee_b: number;
  max_block_size: number;
  max_tx_size: number;
  protocol_major_ver: number;
  protocol_minor_ver: number;
  key_deposit: string;
  pool_deposit: string;
  gov_action_deposit?: string | null;
  drep_deposit?: string | null;
}

interface RecentBlocksResult {
  blocks: BlockSummary[];
  incomplete: boolean;
}

async function fetchRecentBlocks(): Promise<RecentBlocksResult> {
  const latest = await blockfrostFetch<BlockSummary>("/api/v0/blocks/latest");
  const blocks = [latest];
  let cursor = latest.previous_block;
  while (blocks.length < 12 && cursor) {
    try {
      const block = await blockfrostFetch<BlockSummary>(`/api/v0/blocks/${cursor}`);
      blocks.push(block);
      cursor = block.previous_block;
    } catch {
      return { blocks, incomplete: true };
    }
  }
  return { blocks, incomplete: false };
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

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function shortDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
    </div>
  );
}

export default function ExplorerOverview() {
  const now = useNow(15_000);
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
  const epochQuery = useQuery({
    queryKey: ["dingo", "epoch", "latest"],
    queryFn: () => blockfrostFetch<EpochResponse>("/api/v0/epochs/latest"),
    refetchInterval: 60_000,
  });
  const networkQuery = useQuery({
    queryKey: ["dingo", "network"],
    queryFn: () => blockfrostFetch<NetworkResponse>("/api/v0/network"),
    refetchInterval: 60_000,
  });
  const genesisQuery = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: () => blockfrostFetch<GenesisResponse>("/api/v0/genesis"),
    staleTime: Infinity,
  });
  const paramsQuery = useQuery({
    queryKey: ["dingo", "epoch", "latest", "parameters"],
    queryFn: () => blockfrostFetch<ProtocolParamsResponse>("/api/v0/epochs/latest/parameters"),
    refetchInterval: 60_000,
  });

  const latestBlock = blocksQuery.data?.blocks[0];
  const chronologicalBlocks = [...(blocksQuery.data?.blocks ?? [])].reverse();
  const maxTxCount = Math.max(1, ...chronologicalBlocks.map((block) => block.tx_count));
  const intervals = chronologicalBlocks.slice(1).map((block, index) =>
    Math.max(0, block.time - chronologicalBlocks[index].time),
  );
  const averageInterval = intervals.length
    ? Math.round(intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length)
    : null;
  const tipAge = latestBlock
    ? Math.max(0, Math.floor(now / 1000) - latestBlock.time)
    : null;
  const epochProgress = latestBlock && genesisQuery.data?.epoch_length
    ? Math.min(100, Math.max(0, (latestBlock.epoch_slot / genesisQuery.data.epoch_length) * 100))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Link to="/explorer/mempool" className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600">
          Mempool
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${mempoolStatus === "live" ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>
            {mempoolStatus === "live" ? pendingCount : "…"}
          </span>
        </Link>
        <Link to="/explorer/network" className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600">Network</Link>
        <Link to="/explorer/pools" className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600">Stake pools</Link>
        <Link to="/explorer/dreps" className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600">DReps</Link>
        <Link to="/explorer/epoch" className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300 hover:border-slate-600">Current epoch</Link>
      </div>

      <QueryState isLoading={blocksQuery.isLoading} error={blocksQuery.error}>
        {latestBlock && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Chain tip" value={`#${latestBlock.height.toLocaleString()}`} detail={`Slot ${latestBlock.slot.toLocaleString()} · ${latestBlock.hash.slice(0, 12)}…`} />
            <StatCard label="Current epoch" value={String(latestBlock.epoch)} detail={epochQuery.data ? `${epochQuery.data.block_count.toLocaleString()} blocks so far` : "Epoch statistics loading"} />
            <StatCard label="Transactions in tip" value={String(latestBlock.tx_count)} detail={`${latestBlock.size.toLocaleString()} bytes`} />
            <StatCard label="Tip age" value={tipAge === null ? "—" : shortDuration(tipAge)} detail={timeLabel(latestBlock.time)} />
          </div>
        )}
      </QueryState>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Epoch activity">
          <QueryState isLoading={epochQuery.isLoading} error={epochQuery.error}>
            {epochQuery.data && (
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-semibold text-white">Epoch {epochQuery.data.epoch}</span>
                  <span className="text-sm text-slate-400">{epochQuery.data.block_count.toLocaleString()} blocks · {epochQuery.data.tx_count.toLocaleString()} transactions</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-800" role="progressbar" aria-label="Epoch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(epochProgress ?? 0)}>
                  <div className="h-full rounded bg-sky-500" style={{ width: `${epochProgress ?? 0}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">{epochProgress === null ? "Progress unavailable" : `${epochProgress.toFixed(1)}% of epoch slots`}</p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 text-sm">
                  <div className="py-1"><span className="text-slate-500">Output</span><div>{formatAda(BigInt(epochQuery.data.output))} ADA</div></div>
                  <div className="py-1"><span className="text-slate-500">Fees</span><div>{formatAda(BigInt(epochQuery.data.fees))} ADA</div></div>
                  <div className="py-1"><span className="text-slate-500">Starts</span><div>{timeLabel(epochQuery.data.start_time)}</div></div>
                  <div className="py-1"><span className="text-slate-500">Ends</span><div>{timeLabel(epochQuery.data.end_time)}</div></div>
                </div>
              </div>
            )}
          </QueryState>
        </Panel>

        <Panel title="Network snapshot" action={<Link className="text-xs text-sky-400 hover:text-sky-300" to="/explorer/network">Network details →</Link>}>
          <QueryState isLoading={networkQuery.isLoading} error={networkQuery.error}>
            {networkQuery.data && (
              <div className="grid grid-cols-2 gap-x-4">
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Circulating supply</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.supply.circulating))} ADA</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Max supply</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.supply.max))} ADA</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Live stake</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.stake.live))} ADA</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Active stake</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.stake.active))} ADA</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Treasury</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.supply.treasury))} ADA</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Reserves</span><div className="text-sm">{formatAda(BigInt(networkQuery.data.supply.reserves))} ADA</div></div>
              </div>
            )}
          </QueryState>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent block activity">
          <QueryState isLoading={blocksQuery.isLoading} error={blocksQuery.error}>
            {blocksQuery.data?.incomplete && <p className="mb-2 text-xs text-amber-300">Some older blocks could not be loaded.</p>}
            {chronologicalBlocks.length > 0 && (
              <>
                <div className="flex h-32 items-end gap-1 border-b border-slate-800 px-1" role="img" aria-label="Transactions per recent block">
                  {chronologicalBlocks.map((block) => (
                    <Link
                      key={block.hash}
                      to={`/explorer/block/${block.hash}`}
                      title={`Block #${block.height}: ${block.tx_count} transactions`}
                      aria-label={`Open block ${block.height}, ${block.tx_count} transactions`}
                      className="min-w-1 flex-1 rounded-t-sm bg-sky-600/80 hover:bg-sky-400"
                      style={{ height: `${Math.max(4, (block.tx_count / maxTxCount) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>#{chronologicalBlocks[0].height}</span>
                  <span>#{chronologicalBlocks[chronologicalBlocks.length - 1]?.height}</span>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {averageInterval === null ? "Block timing unavailable" : `Average time between these blocks: ${shortDuration(averageInterval)}`}
                  {latestBlock && ` · latest slot leader ${latestBlock.slot_leader}`}
                </p>
              </>
            )}
          </QueryState>
        </Panel>

        <Panel title="Protocol snapshot" action={<Link className="text-xs text-sky-400 hover:text-sky-300" to="/explorer/epoch">All parameters →</Link>}>
          <QueryState isLoading={paramsQuery.isLoading} error={paramsQuery.error}>
            {paramsQuery.data && (
              <div className="grid grid-cols-2 gap-x-4 text-sm">
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Protocol version</span><div>{paramsQuery.data.protocol_major_ver}.{paramsQuery.data.protocol_minor_ver}</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Parameter epoch</span><div>{paramsQuery.data.epoch}</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Max transaction</span><div>{paramsQuery.data.max_tx_size.toLocaleString()} bytes</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Max block</span><div>{paramsQuery.data.max_block_size.toLocaleString()} bytes</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Minimum fee</span><div>{paramsQuery.data.min_fee_a} × size + {paramsQuery.data.min_fee_b} lovelace</div></div>
                <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Deposits</span><div>Key {formatAda(BigInt(paramsQuery.data.key_deposit))} ADA · Pool {formatAda(BigInt(paramsQuery.data.pool_deposit))} ADA</div></div>
                {paramsQuery.data.gov_action_deposit && <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">Governance action deposit</span><div>{formatAda(BigInt(paramsQuery.data.gov_action_deposit))} ADA</div></div>}
                {paramsQuery.data.drep_deposit && <div className="py-1.5"><span className="text-xs uppercase tracking-wide text-slate-500">DRep deposit</span><div>{formatAda(BigInt(paramsQuery.data.drep_deposit))} ADA</div></div>}
              </div>
            )}
          </QueryState>
        </Panel>
      </div>

      <Panel title="Recent blocks">
        <QueryState isLoading={blocksQuery.isLoading} error={blocksQuery.error}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-slate-500"><th className="pb-2">Height</th><th className="pb-2">Hash</th><th className="pb-2">Epoch</th><th className="pb-2">Txs</th><th className="pb-2">Time</th></tr></thead>
              <tbody>
                {blocksQuery.data?.blocks.map((block) => (
                  <tr key={block.hash} className="border-t border-slate-800">
                    <td className="py-1.5"><HashLink kind="block" id={String(block.height)} /></td>
                    <td className="py-1.5"><HashLink kind="block" id={block.hash} visible={14} /></td>
                    <td className="py-1.5 text-slate-400">{block.epoch}</td>
                    <td className="py-1.5 text-slate-400">{block.tx_count}</td>
                    <td className="py-1.5 text-slate-400">{timeLabel(block.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>

      <Panel title="Latest block transactions">
        <QueryState isLoading={latestTxsQuery.isLoading} error={latestTxsQuery.error}>
          {latestTxsQuery.data?.length === 0 && <p className="text-sm text-slate-500">No transactions in the latest block.</p>}
          <ul className="flex flex-col gap-1">{latestTxsQuery.data?.map((hash) => <li key={hash}><HashLink kind="tx" id={hash} visible={16} /></li>)}</ul>
        </QueryState>
      </Panel>
    </div>
  );
}
