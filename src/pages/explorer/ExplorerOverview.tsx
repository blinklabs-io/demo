import { RecentHeaderVersions } from "../../components/explorer/RecentHeaderVersions";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { compactAda, epochProgress } from "../../lib/visualFormat";
import { useState } from "react";
import {
  BarChart,
  Distribution,
  Metric,
  Gauge,
  PageIntro,
} from "../../components/explorer/Visuals";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { HashLink } from "../../components/explorer/HashLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
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
      const block = await blockfrostFetch<BlockSummary>(
        `/api/v0/blocks/${cursor}`,
      );
      blocks.push(block);
      cursor = block.previous_block;
    } catch {
      return { blocks, incomplete: true };
    }
  }
  return { blocks, incomplete: false };
}

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function shortDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function ExplorerOverview() {
  const [chart, setChart] = useState<"tx_count" | "size">("tx_count");
  const now = useNow(15_000);
  const pendingCount = useMempoolStore((state) => state.pendingTxs.size);
  const mempoolStatus = useMempoolStore((state) => state.status);
  const blocksQuery = useQuery({
    queryKey: ["dingo", "recent-blocks"],
    queryFn: fetchRecentBlocks,
    refetchInterval: 20_000,
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
  const blocks = blocksQuery.data?.blocks ?? [];
  const latest = blocks[0];
  const network = networkQuery.data;
  const chronological = [...blocks].reverse();
  const intervals = chronological
    .slice(1)
    .map((block, i) => Math.max(0, block.time - chronological[i].time));
  const average = intervals.length
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : null;
  const progress = epochProgress(
    latest?.epoch_slot,
    genesisQuery.data?.epoch_length,
  );
  const txs = useQuery({
    queryKey: ["dingo", "block", latest?.hash, "txs", "latest-preview"],
    queryFn: () =>
      blockfrostFetch<string[]>(
        `/api/v0/blocks/${latest!.hash}/txs?count=8&order=desc`,
      ),
    enabled: Boolean(latest),
  });
  return (
    <div className="flex flex-col gap-4 overview-showcase">
      <PageIntro
        eyebrow="A living chain. Powered by Dingo."
        title="The chain, in motion."
        detail="Every block. Every epoch. Happening now."
        symbol="◈"
        action={
          <Link to="/explorer/mempool" className="status-badge positive">
            {mempoolStatus === "live"
              ? `${pendingCount} pending transactions`
              : "Connecting to mempool"}
          </Link>
        }
      />
      <QueryState isLoading={blocksQuery.isLoading} error={blocksQuery.error}>
        {latest && (
          <div className="metric-grid">
            <Metric
              label="Latest block"
              value={`#${latest.height.toLocaleString()}`}
              detail={`${shortDuration(Math.max(0, Math.floor(now / 1000) - latest.time))} ago`}
            />
            <Metric
              label="Current epoch"
              value={latest.epoch.toLocaleString()}
              detail={
                progress === null ? "" : `${progress.toFixed(1)}% complete`
              }
            />
            <Metric
              label="Block interval"
              value={average === null ? "—" : `${average}s`}
              detail={`Average across ${intervals.length} intervals`}
            />
            <Metric
              label="Transactions"
              value={blocks
                .reduce((sum, b) => sum + b.tx_count, 0)
                .toLocaleString()}
              detail={`Across ${blocks.length} recent blocks`}
            />
          </div>
        )}
      </QueryState>
      {blocks.length > 0 && (
        <nav className="block-ribbon" aria-label="Recent block chain">
          <span className="ribbon-caption">
            <span className="live-dot" />
            Chain tip
          </span>
          {blocks.slice(0, 6).map((block, i) => (
            <Link
              key={block.hash}
              to={`/explorer/block/${block.hash}`}
              className={i === 0 ? "ribbon-block tip" : "ribbon-block"}
            >
              <span className="ribbon-cube" aria-hidden="true">
                ⬡
              </span>
              <strong>{block.height.toLocaleString()}</strong>
              <small>
                {block.tx_count} TX · {(block.size / 1024).toFixed(1)} KB
              </small>
            </Link>
          ))}
        </nav>
      )}
      <div className="visual-grid wide-left">
        <Panel
          title="Block activity"
          action={
            <div className="flex gap-2">
              {(["tx_count", "size"] as const).map((key) => (
                <button
                  key={key}
                  className={`status-badge ${chart === key ? "positive" : "neutral"}`}
                  aria-pressed={chart === key}
                  onClick={() => setChart(key)}
                >
                  {key === "tx_count" ? "Transactions" : "Block size"}
                </button>
              ))}
            </div>
          }
        >
          <QueryState
            isLoading={blocksQuery.isLoading}
            error={blocksQuery.error}
          >
            <BarChart
              title={chart === "tx_count" ? "transactions" : "bytes"}
              items={chronological.map((block) => ({
                label: `#${block.height}`,
                value: block[chart],
                href: `/explorer/block/${block.hash}`,
                detail: timeLabel(block.time),
              }))}
            />
            <p className="mt-5 text-xs text-slate-400">
              Hover or focus a bar for details. Select a block to explore it.
            </p>
            {blocksQuery.data?.incomplete && (
              <p className="mt-2 text-xs text-amber-300">
                Only available blocks are shown.
              </p>
            )}
          </QueryState>
        </Panel>
        <Panel
          title="ADA supply"
          action={
            <Link className="text-xs text-sky-400" to="/explorer/network">
              Network ↗
            </Link>
          }
        >
          <QueryState
            isLoading={networkQuery.isLoading}
            error={networkQuery.error}
          >
            {network && (
              <Distribution
                title="ADA supply"
                unit={compactAda(network.supply.max)}
                items={[
                  {
                    label: "Circulating",
                    value: BigInt(network.supply.circulating),
                    display: compactAda(network.supply.circulating),
                  },
                  {
                    label: "Treasury",
                    value: BigInt(network.supply.treasury),
                    display: compactAda(network.supply.treasury),
                  },
                  {
                    label: "Reserves",
                    value: BigInt(network.supply.reserves),
                    display: compactAda(network.supply.reserves),
                  },
                  {
                    label: "Locked",
                    value: BigInt(network.supply.locked),
                    display: compactAda(network.supply.locked),
                  },
                ]}
              />
            )}
          </QueryState>
        </Panel>
      </div>
      <div className="visual-grid">
        <Panel
          title={latest ? `Epoch ${latest.epoch}` : "Epoch progress"}
          action={
            <Link className="text-xs text-sky-400" to="/explorer/epoch">
              Explore epoch ↗
            </Link>
          }
        >
          <QueryState
            isLoading={blocksQuery.isLoading || genesisQuery.isLoading}
            error={blocksQuery.error || genesisQuery.error}
          >
            {latest && progress !== null && (
              <>
                <Gauge
                  label="Epoch elapsed"
                  value={progress}
                  detail={`${latest.epoch_slot.toLocaleString()} of ${genesisQuery.data!.epoch_length.toLocaleString()} slots`}
                />
                <div className="mt-5 flex justify-between text-xs text-slate-400">
                  <span>Epoch {latest.epoch}</span>
                  <span>Next → {latest.epoch + 1}</span>
                </div>
              </>
            )}
          </QueryState>
        </Panel>
        <Panel title="Transactions in the latest block">
          <QueryState isLoading={txs.isLoading} error={txs.error}>
            {txs.data?.length === 0 ? (
              <Link
                className="sealed-block"
                to={`/explorer/block/${latest?.hash}`}
              >
                <span className="sealed-block-symbol" aria-hidden="true">
                  ⬡<i>✓</i>
                </span>
                <strong>Block sealed.</strong>
                <p>No transactions in this block.</p>
                <small>
                  Inspect block #{latest?.height.toLocaleString()} →
                </small>
              </Link>
            ) : (
              <ul className="activity-list">
                {txs.data?.map((hash) => (
                  <li key={hash}>
                    <span className="status-badge positive">TX</span>
                    <HashLink kind="tx" id={hash} visible={12} />
                    <span className="text-slate-500">↗</span>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Panel>
      </div>
      {blocks.length > 0 && (
        <Panel
          title="Recent header versions"
          action={
            <span className="text-xs text-slate-400">
              {genesisQuery.data?.network_magic === 2 ? "Preview · " : ""}Latest{" "}
              {blocks.length} blocks
            </span>
          }
        >
          <RecentHeaderVersions blocks={blocks} />
        </Panel>
      )}
      <Panel title="Latest blocks">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Producer</th>
                <th>Header version</th>
                <th>Transactions</th>
                <th>Size</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.hash}>
                  <td>
                    <HashLink kind="block" id={String(block.height)} />
                  </td>
                  <td>
                    <HashLink kind="pool" id={block.slot_leader} visible={8} />
                  </td>
                  <td>
                    <BlockHeaderVersion hash={block.hash} slot={block.slot} />
                  </td>
                  <td>
                    <span className="status-badge">{block.tx_count}</span>
                  </td>
                  <td>{(block.size / 1024).toFixed(1)} KB</td>
                  <td>{timeLabel(block.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
