import { ToolArt } from "../components/illustrations/ToolArt";
import type { ToolFormKind } from "../lib/chain/toolForms";
import { RollingNumber } from "../components/RollingNumber";
import { MainnetApps } from "../components/markets/MainnetApps";
import { nativeTicker } from "../lib/format";
import { DINGO_NETWORK } from "../lib/dingo/config";
import { useQuery } from "@tanstack/react-query";
import {
  recentBlocksQuery,
  type BlockSummary,
} from "../lib/explorer/recentBlocks";
import { creationTools, type CreationToolId } from "../lib/creationTools";
import { ChainSnapshot } from "../components/explorer/ChainSnapshot";
import { lazy, Suspense, useState } from "react";
import { Link } from "../components/NetworkLink";
import { useNodeHealth } from "../lib/dingo/nodeHealth";
import { useMempoolStore } from "../stores/mempoolStore";
import { BlockActivityStrip } from "../components/chain/BlockActivityStrip";
import { BlockMosaic } from "../components/chain/BlockMosaic";

const ChainScene = lazy(() => import("../components/chain/ChainScene"));

function creationExperience(
  id: CreationToolId,
  tag: string,
  category = "Create",
) {
  const tool = creationTools.find((tool) => tool.id === id)!;
  return {
    to: tool.to,
    title: tool.name,
    category,
    description: tool.description,
    tag,
    art: id as ToolFormKind,
  };
}

const experiences = [
  ...(DINGO_NETWORK.id === "prime-testnet" ? [{
    to: "/wallet/bridge", title: "Reactor Bridge", category: "Use",
    description: "Bridge test AP3X to Vector or Nexus. Build and sign here, then follow delivery through Reactor.",
    tag: "Prime · Vector · Nexus",
    art: "bridge" as ToolFormKind,
  }] : []),
  ...(DINGO_NETWORK.id === "musashi"
    ? [
        {
          to: "/explorer/leios",
          title: "Leios on Musashi",
          category: "Explore",
          description:
            "Follow ranking blocks, endorser-block announcements, and certificates on Musashi.",
          tag: "Musashi · Leios",
          art: "leios" as ToolFormKind,
        },
      ]
    : []),
  creationExperience("transactions", "Compose · Inspect · Export"),
  creationExperience("data", "Datums · Redeemers · CBOR"),
  {
    to: "/explorer/track",
    title: "Transaction tracker",
    category: "Explore",
    description:
      "Follow submission, mempool presence, inclusion and confirmations with live chain evidence.",
    tag: "From submission to inclusion",
    art: "track" as ToolFormKind,
  },
  {
    to: "/participate",
    title: "Participation",
    category: "Participate",
    description:
      `Answer governance actions as an ${nativeTicker()} holder, create surveys, and read the recorded responses.`,
    tag: "CIP-204 + CIP-179",
    art: "participate" as ToolFormKind,
  },
  creationExperience("mint", "CIP-25 · Native assets"),
  {
    to: DINGO_NETWORK.id === "mainnet" ? "/wallet/markets/liquidity" : "/wallet/markets/liquidity?network=preprod",
    title: "DeFi markets",
    category: "Use",
    description: DINGO_NETWORK.id === "mainnet"
      ? "Swap Cardano assets, manage liquidity positions and follow Minswap orders through Dingo."
      : "Explore lending, covered options, liquidity positions and direct on-chain markets through Dingo.",
    tag: DINGO_NETWORK.id === "mainnet" ? "Minswap · Mainnet" : "DeFi Kernel + Minswap · Preprod",
    art: "markets" as ToolFormKind,
  },
  {
    to: "/explorer/mempool",
    title: "Live mempool",
    category: "Explore",
    description:
      "Watch pending transactions in Dingo’s mempool before they are included in a block.",
    tag: "Live transaction stream",
    art: "mempool" as ToolFormKind,
  },
  creationExperience("proof", "Local hashing · On-chain proofs"),
  creationExperience("utxos", "Consolidate · Split", "Use"),
  creationExperience("batch",
    "Multiple recipients · CSV import",
    "Use",
  ),
  {
    to: "/explorer/network",
    title: "Network operations",
    category: "Explore",
    description:
      "Supply, stake, epoch progress and protocol timing.",
    tag: "Network instruments",
    art: "network" as ToolFormKind,
  },
];
export default function Experiences() {
  const [filter, setFilter] = useState("All");
  const health = useNodeHealth();
  const [inspectedBlock, setInspectedBlock] = useState<BlockSummary | null>(
    null,
  );
  const recent = useQuery({
    ...recentBlocksQuery,
    enabled: inspectedBlock === null,
  });
  const candidate =
    recent.data?.blocks.find((block) => block.tx_count > 0) ??
    recent.data?.blocks[0];
  if (inspectedBlock && !recent.data) setInspectedBlock(null);
  else if (
    !inspectedBlock &&
    candidate &&
    !recent.isFetching &&
    (recent.isFetchedAfterMount || !recent.isStale)
  )
    setInspectedBlock(candidate);
  const shownBlock = inspectedBlock;
  const pending = useMempoolStore((s) => s.pendingTxs.size);
  const stream = useMempoolStore((s) => s.status);

  return (
    <div className="experience-page">
      <section className="experience-hero">
        <div>
          <h1>Cardano apps, served by Dingo</h1>
          <p>
            Each network here has its own Dingo node. On {DINGO_NETWORK.label},
            the explorer, swaps, token tools and governance read from and
            submit to that node's APIs. No external indexer, and no wallet
            until you sign.
          </p>
          <div className="experience-actions">
            <Link
              className="experience-primary"
              to={DINGO_NETWORK.id === "prime-testnet" ? "/wallet/bridge" : DINGO_NETWORK.id === "mainnet" ? "/wallet/markets/liquidity" : "/wallet/markets/liquidity?network=preprod"}
            >
              {DINGO_NETWORK.id === "prime-testnet" ? "Bridge AP3X" : `Explore ${DINGO_NETWORK.id === "mainnet" ? "Mainnet" : "Preprod"} DeFi`}
            </Link>
            <a href="#live-block">Look inside a recent block</a>
          </div>
        </div>
        {recent.data && (
          <Suspense fallback={null}>
            <ChainScene blocks={recent.data.blocks.slice(0, 10)} />
          </Suspense>
        )}
        <div className="experience-pulse">
          <Link to="/explorer">
            <span>Latest block</span>
            <strong>
              <RollingNumber
                value={
                  health.data
                    ? `#${health.data.tipHeight.toLocaleString()}`
                    : "—"
                }
              />
            </strong>
          </Link>
          <Link to="/explorer/mempool">
            <span>Mempool</span>
            <strong>
              {stream === "live"
                ? <RollingNumber value={`${pending} pending`} />
                : stream === "error"
                  ? "Reconnecting…"
                  : stream === "idle"
                    ? "Not started"
                    : "Connecting…"}
            </strong>
          </Link>
          <Link to="/api">
            <span>APIs</span>
            <strong>Open the API playground</strong>
          </Link>
        </div>
      </section>
      {DINGO_NETWORK.id === "mainnet" && <MainnetApps />}
      <ChainSnapshot />
      <section id="live-block" className="experience-live">
        <header className="experience-section-heading">
          <h2>Recent blocks</h2>
          {shownBlock && (
            <div className="experience-actions">
              {inspectedBlock &&
                health.data &&
                inspectedBlock.hash !== health.data.tipHash && (
                  <button
                    type="button"
                    disabled={recent.isFetching}
                    onClick={() => {
                      void recent.refetch().then(({ data }) => {
                        const next =
                          data?.blocks.find((block) => block.tx_count > 0) ??
                          data?.blocks[0];
                        if (next) setInspectedBlock(next);
                      });
                    }}
                  >
                    {recent.isFetching
                      ? "Refreshing…"
                      : "Refresh recent activity"}
                  </button>
                )}
              <Link to={`/explorer/block/${shownBlock.hash}`}>
                Open block #{shownBlock.height.toLocaleString()} ↗
              </Link>
            </div>
          )}
        </header>
        <p>
          Pick a block to see its transactions sized by bytes. Select a tile to
          open that transaction.
        </p>
        {recent.data && (
          <BlockActivityStrip
            blocks={recent.data.blocks}
            selectedHash={shownBlock?.hash}
            onSelect={setInspectedBlock}
          />
        )}
        {recent.error && shownBlock && (
          <p role="status" className="text-amber-300">
            Recent activity refresh unavailable. Showing the selected block.
          </p>
        )}
        {shownBlock ? (
          <BlockMosaic hash={shownBlock.hash} total={shownBlock.tx_count} />
        ) : (
          <div className="experience-unavailable">
            <p>
              {recent.error || health.error
                ? "Could not load recent blocks from Dingo."
                : "Waiting for chain data…"}
            </p>
            <button
              type="button"
              onClick={() => {
                void recent.refetch();
                void health.refetch();
              }}
            >
              Refresh chain data
            </button>
          </div>
        )}
      </section>
      <section id="experiences">
        <header className="experience-section-heading">
          <h2>What you can do here</h2>
          <div
            className="experience-filters"
            role="group"
            aria-label="Filter experiences"
          >
            {["All", "Create", "Use", "Participate", "Explore"].map(
              (category) => (
                <button
                  type="button"
                  key={category}
                  aria-pressed={category === filter}
                  onClick={() => setFilter(category)}
                >
                  {category}
                </button>
              ),
            )}
          </div>
        </header>
        <div className="experience-grid">
          {experiences
            .filter(
              (experience) =>
                filter === "All" || experience.category === filter,
            )
            .map((experience) => (
              <Link
                className="experience-card"
                data-category={experience.category}
                key={experience.to}
                to={experience.to}
              >
                <ToolArt kind={experience.art} />
                <div className="experience-card-body">
                  <h3>{experience.title}</h3>
                  <p>{experience.description}</p>
                  <small>{experience.tag}</small>
                </div>
              </Link>
            ))}
        </div>
      </section>
      <footer className="experience-footnote">
        <p>
          {DINGO_NETWORK.id === "mainnet" ? "Cardano Mainnet transactions use ADA." : `${DINGO_NETWORK.label} is a public test network. Transactions use test ${nativeTicker()}.`} Your wallet signs; Dingo provides chain data and submits
          transactions.
        </p>
        <Link to="/api">See the APIs behind these tools</Link>
      </footer>
    </div>
  );
}
