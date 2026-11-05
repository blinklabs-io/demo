import { DINGO_NETWORK } from "../../lib/dingo/config";
import { networkSearch, urlDingoNetwork } from "../../lib/dingo/networks";
import { reloadDingoPage } from "../../lib/dingo/networkSelection";
import { useChainReconciliation } from "../../lib/chain/useChainReconciliation";
import { useEffect, useLayoutEffect } from "react";
import { mainNavigation, normalizePath, sectionNavigation } from "../../lib/navigation";
import { Outlet, useLocation, useNavigate, useNavigationType } from "react-router";
import { Link } from "../NetworkLink";
import { Header } from "./Header";
import { useMempoolStore } from "../../stores/mempoolStore";
import { useTipStore } from "../../stores/tipStore";

export function AppShell() {
  const location = useLocation();
  const { pathname: rawPathname, search, hash } = location;
  const navigate = useNavigate();
  let requestedNetwork: string | null;
  try { requestedNetwork = urlDingoNetwork(search); }
  catch { requestedNetwork = "invalid"; }
  const reload = requestedNetwork !== null && requestedNetwork !== DINGO_NETWORK.id;
  useLayoutEffect(() => {
    if (reload) {
      reloadDingoPage(`${rawPathname}${search}${hash}`);
    } else if (requestedNetwork === null) {
      void navigate({ pathname: rawPathname, search: networkSearch(search, DINGO_NETWORK.id), hash }, { replace: true, state: location.state, preventScrollReset: true });
    }
  }, [reload, requestedNetwork, rawPathname, search, hash, location.state, navigate]);
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
    if (reload) return;
    startMempoolFeed();
    startTipFeed();
  }, [startMempoolFeed, startTipFeed, reload]);

  if (reload) return <main role="status">Changing network…</main>;

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
