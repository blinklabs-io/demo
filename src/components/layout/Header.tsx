import { Link, NavLink, useLocation } from "react-router";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { WalletConnectSummary } from "./WalletConnectSummary";
import { ConnectDingoBanner } from "./ConnectDingoBanner";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

const links = [
  ["/explorer", "Overview", "◫"],
  ["/explorer/network", "Network", "◎"],
  ["/explorer/epoch", "Epochs", "◷"],
  ["/explorer/pools", "Stake pools", "◈"],
  ["/explorer/dreps", "Representatives", "♧"],
  ["/explorer/governance", "Governance", "⚑"],
  ["/explorer/mempool", "Mempool", "≋"],
  ["/wallet", "Wallet", "▣"],
  ["/api", "API playground", "⌘"],
];

export function Header() {
  const { pathname } = useLocation();
  const { error } = useNodeHealth();
  return (
    <>
      <aside className="sidebar">
        <NavLink to="/explorer" className="brand">
          <span className="brand-mark" aria-hidden="true">
            d
          </span>
          <span>
            dingo<span className="brand-sub">NETWORK EXPLORER</span>
          </span>
        </NavLink>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {links.map(([to, label, icon]) =>
            to === "/explorer/governance" ? (
              <Link
                key={to}
                to={to}
                className={`side-link ${pathname === to || pathname.startsWith("/explorer/proposal/") ? "selected" : ""}`}
                aria-current={
                  pathname === to || pathname.startsWith("/explorer/proposal/")
                    ? "page"
                    : undefined
                }
              >
                <span className="nav-icon" aria-hidden="true">
                  {icon}
                </span>
                {label}
              </Link>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === "/explorer"}
                className={({ isActive }) =>
                  `side-link ${isActive || (to === "/explorer/governance" && pathname.startsWith("/explorer/proposal/")) ? "selected" : ""}`
                }
              >
                <span className="nav-icon" aria-hidden="true">
                  {icon}
                </span>
                {label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="live-dot" /> Powered by Dingo
          <p>Explore the chain. Follow the data.</p>
        </div>
      </aside>
      <header className="workspace-header">
        <GlobalLookup />
        <WalletConnectSummary />
        <div className="health-row">
          <NodeHealthStrip />
        </div>
        {error instanceof BlockfrostError && error.status === 0 && (
          <ConnectDingoBanner error={error} />
        )}
      </header>
    </>
  );
}
