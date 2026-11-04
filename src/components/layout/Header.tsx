import { isParticipationPath } from "../../lib/navigation";
import { Link, NavLink, useLocation } from "react-router";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { WalletConnectSummary } from "./WalletConnectSummary";
import { ConnectDingoBanner } from "./ConnectDingoBanner";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

const links = [
  ["/", "Discover", "✦"],
  ["/participate", "Participate", "◉"],
  ["/wallet/swap", "Swap", "⇄"],
  ["/wallet/tools", "Create & build", "⌁"],
  ["/explorer", "Overview", "◫"],
  ["/explorer/network", "Network", "◎"],
  ["/explorer/epoch", "Epochs", "◷"],
  ["/explorer/pools", "Stake pools", "◈"],
  ["/explorer/mempool", "Mempool", "≋"],
  ["/wallet", "Wallet", "▣"],
  ["/api", "API playground", "⌘"],
];

export function Header() {
  const { pathname } = useLocation();
  const { error } = useNodeHealth();
  function groupedActive(to: string) {
    return to === "/participate"
      ? isParticipationPath(pathname)
      : to === "/wallet"
        ? pathname === "/wallet" ||
          /^\/wallet\/(send|delegate)(\/|$)/.test(pathname)
        : pathname === to;
  }
  return (
    <>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            d
          </span>
          <span>
            dingo<span className="brand-sub">BUILD WITH DINGO</span>
          </span>
        </NavLink>
        <p className="nav-caption">APPS & EXPLORER</p>
        <nav aria-label="Main navigation">
          {links.map(([to, label, icon]) =>
            to === "/participate" || to === "/wallet" ? (
              <Link
                key={to}
                to={to}
                className={`side-link ${groupedActive(to) ? "selected" : ""}`}
                aria-current={groupedActive(to) ? "page" : undefined}
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
                end={to === "/explorer" || to === "/" || to === "/wallet"}
                className={({ isActive }) =>
                  `side-link ${isActive ? "selected" : ""}`
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
          <p>Apps powered by a Cardano node.</p>
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
