import {
  isParticipationPath,
  isExplorePath,
  normalizePath,
} from "../../lib/navigation";
import { Link, NavLink, useLocation } from "react-router";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";

const links = [
  ["/", "Discover", "✦"],
  ["/explorer", "Explore", "◫"],
  ["/participate", "Participate", "◉"],
  ["/wallet/swap", "Swap", "⇄"],
  ["/wallet/tools", "Create & build", "⌁"],
  ["/wallet", "Wallet", "▣"],
  ["/api", "API playground", "⌘"],
];

export function Header() {
  const { pathname: rawPathname } = useLocation();
  const pathname = normalizePath(rawPathname);
  function groupedActive(to: string) {
    return to === "/explorer"
      ? isExplorePath(pathname)
      : to === "/participate"
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
            to === "/explorer" || to === "/participate" || to === "/wallet" ? (
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
        <div className="health-row">
          <NodeHealthStrip />
        </div>
      </header>
    </>
  );
}
