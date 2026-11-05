import { useRef, useState } from "react";
import { mainNavigation, normalizePath } from "../../lib/navigation";
import { useLocation } from "react-router";
import { Link } from "../NetworkLink";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { NetworkSwitcher } from "./NetworkSwitcher";

function Sidebar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <aside
      className="sidebar"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="sidebar-brand-row">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">d</span>
          <span>
            dingo<span className="brand-sub">BUILD WITH DINGO</span>
          </span>
        </Link>
        <button
          type="button"
          className="mobile-nav-toggle"
          ref={toggle}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d={open ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
          Menu
        </button>
      </div>
      <p className="nav-caption">DINGO WORKSPACE</p>
      <nav id="main-navigation" aria-label="Main navigation" data-open={open}>
        {mainNavigation.map(({ to, label, icon, matches, group, area }) => (
          <Link
            key={to}
            data-area={area}
            to={to}
            className={`side-link ${matches(pathname) ? "selected" : ""}`}
            aria-current={!group && matches(pathname) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <span className="nav-icon" aria-hidden="true">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="live-dot" /> Powered by Dingo
        <p>Develop and operate on Cardano.</p>
      </div>
    </aside>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const path = normalizePath(pathname);
  return (
    <>
      <Sidebar key={path} pathname={path} />
      <header className="workspace-header">
        <GlobalLookup />
        <div className="health-row">
          <NetworkSwitcher />
          <NodeHealthStrip />
        </div>
      </header>
    </>
  );
}
