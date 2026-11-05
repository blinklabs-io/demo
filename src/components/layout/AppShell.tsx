import { useChainReconciliation } from "../../lib/chain/useChainReconciliation";
import { useEffect } from "react";
import { mainNavigation, normalizePath, sectionNavigation } from "../../lib/navigation";
import { Link, Outlet, useLocation, useNavigationType } from "react-router";
import { Header } from "./Header";
import { useMempoolStore } from "../../stores/mempoolStore";
import { useTipStore } from "../../stores/tipStore";

export function AppShell() {
  const { pathname: rawPathname, hash } = useLocation();
  const pathname = normalizePath(rawPathname);
  const navigationType = useNavigationType();
  const section = sectionNavigation(pathname);
  const area = mainNavigation.find((item) => item.matches(pathname))?.area ?? "discover";
  useChainReconciliation();
  useEffect(() => {
    if (navigationType === "POP" && !hash) return;
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);
  const startMempoolFeed = useMempoolStore((state) => state.start);
  const startTipFeed = useTipStore((state) => state.start);

  useEffect(() => {
    startMempoolFeed();
    startTipFeed();
  }, [startMempoolFeed, startTipFeed]);

  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100" data-area={area}>
      <Header />
      <main className="workspace-main">
        {section && (
          <div className="section-nav">
            <nav aria-label={section.label}>
              {section.items.map(({ to, label, matches }) => (
                <Link
                  key={to}
                  to={to}
                  className={matches(pathname) ? "selected" : ""}
                  aria-current={pathname === to ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
