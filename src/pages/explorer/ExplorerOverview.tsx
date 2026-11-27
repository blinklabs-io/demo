import { DINGO_NETWORK } from "../../lib/dingo/config";
import { recentBlocksQuery } from "../../lib/explorer/recentBlocks";
import { BlockConveyor } from "../../components/chain/BlockConveyor";
import { HeaderVersionHistory } from "../../components/explorer/HeaderVersionHistory";
import { BlockHeaderVersion } from "../../components/explorer/BlockHeaderVersion";
import { epochProgress } from "../../lib/visualFormat";
import { useState } from "react";
import { BarChart, Metric, PageIntro } from "../../components/explorer/Visuals";
import { Link } from "../../components/NetworkLink";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "../../components/explorer/Panel";
import { QueryState } from "../../components/explorer/QueryState";
import { HashLink } from "../../components/explorer/HashLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { useNow } from "../../lib/useNow";
import { RollingNumber } from "../../components/RollingNumber";

interface GenesisResponse {
  epoch_length: number;
  slot_length: number;
  active_slots_coefficient: number;
  network_magic: number;
  system_start: number;
  max_lovelace_supply: string;
}

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function shortDuration(seconds: number): string {
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

export default function ExplorerOverview() {
  const [chart, setChart] = useState<"tx_count" | "size">("tx_count");
  const now = useNow(5_000);
  const blocksQuery = useQuery({
    ...recentBlocksQuery,
    refetchInterval: 20_000,
  });
  const genesisQuery = useQuery({
    queryKey: ["dingo", "genesis"],
    queryFn: () => blockfrostFetch<GenesisResponse>("/api/v0/genesis"),
    staleTime: Infinity,
  });
  const blocks = blocksQuery.data?.blocks ?? [];
  const latest = blocks[0];
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
        title="Explore the chain"
        detail={`Recent blocks, the current epoch and pending transactions on ${DINGO_NETWORK.label}, read from Dingo.`}
        action={
          <div className="page-actions">
            <Link className="experience-primary" to="/explorer/track">Track a transaction</Link>
            <Link className="button-secondary" to="/explorer/mempool">Watch the mempool</Link>
            <Link className="button-secondary" to="/explorer/pools">Browse stake pools</Link>
          </div>
        }
      />
      <QueryState hasData={blocksQuery.data !== undefined} isLoading={blocksQuery.isLoading} error={blocksQuery.error}>
        {latest && (
          <div className="metric-grid">
            <Metric
              label="Latest block"
              value={<RollingNumber value={`#${latest.height.toLocaleString()}`} />}
              detail={shortDuration(Math.max(0, Math.floor(now / 1000) - latest.time))}
            />
            <Metric
              label="Current epoch"
              value={<RollingNumber value={latest.epoch.toLocaleString()} />}
              detail={
                progress === null ? "" : `${progress.toFixed(1)}% complete`
              }
            />
            <Metric
              label="Block interval"
              value={<RollingNumber value={average === null ? "—" : `${average}s`} />}
              detail={`Average of the last ${intervals.length}`}
            />
            <Metric
              label="Transactions"
              value={
                <RollingNumber
                  value={blocks
                    .reduce((sum, b) => sum + b.tx_count, 0)
                    .toLocaleString()}
                />
              }
              detail={`In the last ${blocks.length} blocks`}
            />
          </div>
        )}
      </QueryState>
      {blocks.length > 0 && <BlockConveyor blocks={blocks} />}
      <div className="visual-grid wide-left">
        <Panel
          title="Block activity"
          action={
            <div className="segmented" role="group" aria-label="Chart measure">
              {(["tx_count", "size"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={chart === key}
                  onClick={() => setChart(key)}
                >
                  {key === "tx_count" ? "Transactions" : "Block size"}
                </button>
              ))}
            </div>
          }
        >
          <QueryState hasData={blocksQuery.data !== undefined}
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
            {blocksQuery.data?.incomplete && (
              <p className="mt-4 text-xs text-amber-300">
                Only available blocks are shown.
              </p>
            )}
          </QueryState>
        </Panel>
        <Panel title="Transactions in the latest block">
          <QueryState hasData={txs.data !== undefined} isLoading={txs.isLoading} error={txs.error}>
            {txs.data?.length === 0 ? (
              <p className="panel-empty">
                Block{" "}
                <Link to={`/explorer/block/${latest?.hash}`}>
                  #{latest?.height.toLocaleString()}
                </Link>{" "}
                has no transactions.
              </p>
            ) : (
              <ul className="activity-list">
                {txs.data?.map((hash) => (
                  <li key={hash}>
                    <HashLink kind="tx" id={hash} />
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Panel>
      </div>
      {blocks.length > 0 && (
        <Panel
          title="Header versions"
        >
          <HeaderVersionHistory recent={blocks} />
        </Panel>
      )}
      <Panel title="Latest blocks">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Age</th>
                <th className="num">Transactions</th>
                <th className="num">Size</th>
                <th>Producer</th>
                <th>Node</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.hash}>
                  <td>
                    <Link
                      className="table-id"
                      to={`/explorer/block/${block.hash}`}
                    >
                      {block.height.toLocaleString()}
                    </Link>
                  </td>
                  <td title={timeLabel(block.time)}>
                    {shortDuration(
                      Math.max(0, Math.floor(now / 1000) - block.time),
                    )}
                  </td>
                  <td className="num">{block.tx_count}</td>
                  <td className="num">{(block.size / 1024).toFixed(1)} KB</td>
                  <td>
                    <HashLink kind="pool" id={block.slot_leader} />
                  </td>
                  <td>
                    <BlockHeaderVersion hash={block.hash} slot={block.slot} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
