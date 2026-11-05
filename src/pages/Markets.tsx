import { MarketConfirmation } from "../components/markets/MarketTransaction";
import { useState } from "react";
import { GravityMarket } from "../components/markets/GravityMarket";
import { useParams } from "react-router";
import { DINGO_NETWORK } from "../lib/dingo/config";
import { Link } from "../components/NetworkLink";
import { MinswapMarket } from "../components/markets/MinswapMarket";
import { KernelMarket } from "../components/markets/KernelMarket";
import NotFound from "./NotFound";

export default function Markets() {
  const { tab = "lending" } = useParams();
  if (
    !["liquidity", "lending", "options", "orders", "marketplace"].includes(tab)
  )
    return <NotFound />;
  if (DINGO_NETWORK.id !== "preprod")
    return (
      <section className="market-hero">
        <div>
          <span className="eyebrow">Existing Preprod contracts</span>
          <h1>
            Explore more
            <br />
            <em>of what Dingo can do.</em>
          </h1>
          <p>
            These markets use Preprod deployments. Switching networks
            disconnects your wallet and starts a fresh workspace.
          </p>
          <div className="market-actions">
            <Link
              className="experience-primary"
              to={`/wallet/markets/${tab}?network=preprod`}
            >
              Open Preprod markets →
            </Link>
            <Link to="/wallet/swap">Explore Preview swaps ↗</Link>
          </div>
        </div>
      </section>
    );
  return tab === "liquidity" ? (
    <LiquidityVenues />
  ) : (
    <KernelMarket
      key={tab}
      family={tab as "lending" | "options" | "orders" | "marketplace"}
    />
  );
}

function LiquidityVenues() {
  const [hash, setHash] = useState("");
  const tracking = { hash, submitted: setHash };
  const [venue, setVenue] = useState<"minswap" | "gravity">("minswap");
  return (
    <div className="markets-page">
      <MarketConfirmation tracking={tracking} />
      <nav className="market-mode" aria-label="Liquidity venue">
        <button
          aria-pressed={venue === "minswap"}
          onClick={() => setVenue("minswap")}
        >
          Minswap · liquidity & orders
        </button>
        <button
          aria-pressed={venue === "gravity"}
          onClick={() => setVenue("gravity")}
        >
          Gravity · pool monitor
        </button>
      </nav>
      {venue === "minswap" ? (
        <MinswapMarket tracking={tracking} />
      ) : (
        <GravityMarket />
      )}
    </div>
  );
}
