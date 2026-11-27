import { useRef, useState } from "react";
import { mainNavigation, normalizePath } from "../../lib/navigation";
import { useLocation } from "react-router";
import { Link } from "../NetworkLink";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { Icon } from "../Icon";

function Sidebar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  // Close the mobile menu when the route changes, without rebuilding the sidebar.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
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
          <span className="brand-word" aria-hidden="true" />
          <span className="sr-only">dingo</span>
        </Link>
        <a className="demo-source-link" href="https://github.com/blinklabs-io/demo" target="_blank" rel="noopener noreferrer" aria-label="View demo source on GitHub" title="View demo source on GitHub">
          <Icon name="github" />
        </a>
        <button
          type="button"
          className="mobile-nav-toggle"
          ref={toggle}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "close" : "menu"} />
          Menu
        </button>
      </div>
      <nav id="main-navigation" aria-label="Main navigation" data-open={open}>
        {mainNavigation.map(({ to, label, matches, group, area }) => (
          <Link
            key={to}
            data-area={area}
            to={to}
            className={`side-link ${matches(pathname) ? "selected" : ""}`}
            aria-current={!group && matches(pathname) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon name={area} className="nav-icon" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="live-dot" /> Powered by Dingo
      </div>
    </aside>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const path = normalizePath(pathname);
  return (
    <>
      <Sidebar pathname={path} />
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
