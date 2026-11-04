import { creationTools, type CreationToolId } from "../lib/creationTools";
import { ChainSnapshot } from "../components/explorer/ChainSnapshot";
import { useState } from "react";
import { Link } from "react-router";
import { type NodeHealth, useNodeHealth } from "../lib/dingo/nodeHealth";
import { useMempoolStore } from "../stores/mempoolStore";
import { BlockMosaic } from "../components/chain/BlockMosaic";

function creationExperience(id: CreationToolId, art: string, tag: string, category = "Create") {
  const tool = creationTools.find((tool) => tool.id === id)!;
  return {
    to: tool.to,
    title: tool.name,
    category,
    symbol: tool.icon,
    description: tool.description,
    tag,
    art,
    action: `Open ${tool.name.toLowerCase()}`,
  };
}

const experiences = [
  creationExperience("transactions", "flow", "Compose · Inspect · Export"),
  {
    to: "/participate",
    title: "Participation",
    category: "Participate",
    symbol: "◉",
    description:
      "Answer governance actions as an ADA holder. Create surveys. See what the chain thinks.",
    tag: "CIP-204 + CIP-179",
    art: "voice",
    action: "Join the conversation",
  },
  creationExperience("mint", "mint", "CIP-25 · Native assets"),
  {
    to: "/wallet/swap",
    title: "Asset swaps",
    category: "Use",
    symbol: "⇄",
    description:
      "Explore SundaeSwap pools, compare price history, and build a swap through Dingo.",
    tag: "SundaeSwap · Preview",
    art: "swap",
    action: "Explore swaps",
  },
  {
    to: "/explorer/mempool",
    title: "Live mempool",
    category: "Explore",
    symbol: "≋",
    description:
      "Follow transactions through Dingo’s live mempool, before they become part of a block.",
    tag: "Live transaction stream",
    art: "flow",
    action: "Follow the flow",
  },
  creationExperience("proof", "proof", "Local hashing · On-chain proofs"),
  creationExperience("utxos", "utxo", "Consolidate · Split", "Use"),
  creationExperience("batch", "flow", "Multiple recipients · CSV import", "Use"),
  {
    to: "/explorer/network",
    title: "Network operations",
    category: "Explore",
    symbol: "◎",
    description:
      "Explore supply, stake, network progress, and the signals behind the chain.",
    tag: "Network instruments",
    art: "utxo",
    action: "See the instruments",
  },
];
function ExperienceArt({ kind }: { kind: string }) {
  return (
    <div className={`experience-art art-${kind}`} aria-hidden="true">
      {kind === "voice" ? (
        <>
          {Array.from({ length: 21 }, (_, i) => (
            <i
              key={i}
              style={{
                transform: `rotate(${i * 8 - 80}deg) translateY(-62px)`,
              }}
            />
          ))}
          <b>◉</b>
        </>
      ) : kind === "mint" ? (
        <>
          <i />
          <i />
          <b>✦</b>
        </>
      ) : kind === "swap" ? (
        <svg viewBox="0 0 260 120">
          <path d="M10 92 40 78 68 88 93 55 123 64 151 38 177 48 206 19 249 28" />
          <path d="M10 106 40 93 68 100 93 77 123 82 151 62 177 73 206 49 249 56" />
        </svg>
      ) : kind === "proof" ? (
        <>
          <i />
          <b>✓</b>
          <span>SHA-256</span>
        </>
      ) : (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${12 + (i % 5) * 18}%`,
                top: `${22 + Math.floor(i / 5) * 44}%`,
                width: 12 + i * 3,
                height: 12 + i * 3,
              }}
            />
          ))}
          <b>{kind === "flow" ? "→" : "◌"}</b>
        </>
      )}
    </div>
  );
}
export default function Experiences() {
  const [filter, setFilter] = useState("All");
  const health = useNodeHealth();
  const [inspectedBlock, setInspectedBlock] = useState<NodeHealth | null>(null);
  const shownBlock = inspectedBlock ?? health.data;
  const pending = useMempoolStore((s) => s.pendingTxs.size);
  const stream = useMempoolStore((s) => s.status);

  return (
    <div className="experience-page">
      <section className="experience-hero">
        <div>
          <span className="eyebrow">Build with Dingo · Cardano Preview</span>
          <h1>
            Build apps.
            <br />
            Move value.
            <br />
            <em>Make it real.</em>
          </h1>
          <p>
            A Cardano node is an app platform. Trade, create, participate, and
            follow the chain in motion. This workspace shows how Dingo services dApp development and
            operation. No wallet is needed to explore; connect only when you
            need to sign.
          </p>
          <div className="experience-actions">
            <a className="experience-primary" href="#experiences">
              Explore Dingo capabilities ↓
            </a>
            <a href="#live-block">See a block come alive ↓</a>
          </div>
        </div>
        <div className="experience-orbit">
          <div className="orbit-ring" />
          <div className="orbit-ring inner" />
          <div className="orbit-core">
            <span
              className={`live-dot ${health.data?.isHealthy ? "" : "inactive"}`}
            />
            <strong>DINGO</strong>
            <small>
              {health.data
                ? `Epoch ${health.data.tipEpoch}`
                : health.isError
                  ? "Connection unavailable"
                  : "Connecting to Preview"}
            </small>
          </div>
          <Link className="orbit-node node-one" to="/wallet/tools/mint">
            ✦<span>Create</span>
          </Link>
          <Link className="orbit-node node-two" to="/participate">
            ◉<span>Participate</span>
          </Link>
          <Link className="orbit-node node-three" to="/wallet/swap">
            ⇄<span>Trade</span>
          </Link>
          <Link className="orbit-node node-four" to="/explorer/mempool">
            ≋<span>Watch</span>
          </Link>
        </div>
        <div className="experience-pulse">
          <Link to="/explorer">
            <span>Latest block</span>
            <strong>
              {health.data ? `#${health.data.tipHeight.toLocaleString()}` : "—"}
            </strong>
          </Link>
          <Link to="/explorer/mempool">
            <span>Mempool · {stream}</span>
            <strong>
              {stream === "live"
                ? `${pending} pending`
                : stream === "error"
                  ? "Reconnecting…"
                  : stream === "idle"
                    ? "Not started"
                    : "Connecting…"}
            </strong>
          </Link>
          <Link to="/api">
            <span>The engine underneath</span>
            <strong>Explore Dingo APIs ↗</strong>
          </Link>
        </div>
      </section>
      <ChainSnapshot />
      <section id="experiences">
        <header className="experience-section-heading">
          <div>
            <span className="eyebrow">Real transactions. Real chain data.</span>
            <h2>Dingo capabilities.</h2>
          </div>
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
                className={`experience-card theme-${experience.art}`}
                key={experience.to}
                to={experience.to}
              >
                <ExperienceArt kind={experience.art} />
                <div className="experience-card-copy">
                  <span className="eyebrow">{experience.tag}</span>
                  <h3>{experience.title}</h3>
                  <p>{experience.description}</p>
                  <strong>
                    {experience.action}
                    <span aria-hidden="true">↗</span>
                  </strong>
                </div>
              </Link>
            ))}
        </div>
      </section>
      <section id="live-block" className="experience-live">
        <header className="experience-section-heading">
          <div>
            <span className="eyebrow">
              {inspectedBlock
                ? "A block under your microscope"
                : "Look inside the latest block"}
            </span>
            <h2>Every tile tells a story.</h2>
          </div>
          {shownBlock && (
            <div className="experience-actions">
              {inspectedBlock &&
                health.data &&
                inspectedBlock.tipHash !== health.data.tipHash && (
                  <button type="button" onClick={() => setInspectedBlock(null)}>
                    Inspect latest block →
                  </button>
                )}
              <Link to={`/explorer/block/${shownBlock.tipHash}`}>
                Open block #{shownBlock.tipHeight.toLocaleString()} ↗
              </Link>
            </div>
          )}
        </header>
        <p>
          See what transactions do and how much space they occupy. Select a tile
          to inspect the transaction behind it.
        </p>
        {shownBlock ? (
          <BlockMosaic
            hash={shownBlock.tipHash}
            total={shownBlock.tipTxCount}
            onExplore={() => setInspectedBlock(shownBlock)}
          />
        ) : (
          <div className="experience-unavailable">
            <p>
              {health.error
                ? "Could not load the latest block from Dingo."
                : "Waiting for chain data…"}
            </p>
            <button
              type="button"
              onClick={() => {
                void health.refetch();
              }}
            >
              Refresh chain data
            </button>
          </div>
        )}
      </section>
      <footer className="experience-footnote">
        <strong>Built with Dingo. From development to operation.</strong>
        <p>
          Preview is a public test network. Transactions use test ADA. Your
          wallet signs; Dingo provides chain data and submits transactions.
        </p>
        <Link to="/api">See the APIs powering these experiences →</Link>
      </footer>
    </div>
  );
}
