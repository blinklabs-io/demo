import { useWalletStore } from "../../stores/walletStore";
import { useEffect } from "react";
import {
  isParticipationPath,
  participationSections,
} from "../../lib/navigation";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigationType,
} from "react-router";
import { Header } from "./Header";
import { useMempoolStore } from "../../stores/mempoolStore";
import { useTipStore } from "../../stores/tipStore";

export function AppShell() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "POP" && !hash) return;
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);
  const restoreConnection = useWalletStore((state) => state.restoreConnection);
  useEffect(() => {
    void restoreConnection();
  }, [restoreConnection]);
  const startMempoolFeed = useMempoolStore((state) => state.start);
  const startTipFeed = useTipStore((state) => state.start);

  useEffect(() => {
    // Started once here, not per-page: these are standing subscriptions
    // (ReadMempool + WatchMempool, FollowTip), and AppShell is mounted for
    // the app's entire lifetime, so every page - not just a dedicated
    // mempool view - can read live state for free.
    startMempoolFeed();
    startTipFeed();
  }, [startMempoolFeed, startTipFeed]);

  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <main className="workspace-main">
        {isParticipationPath(pathname) && (
          <div className="wallet-nav">
            <nav aria-label="Participation navigation">
              {participationSections.map(({ to, label, matches }) => (
                <Link
                  key={to}
                  to={to}
                  className={matches(pathname) ? "selected" : ""}
                  aria-current={matches(pathname) ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        )}
        {/^\/wallet(?:\/(send|delegate))?$/.test(pathname) && (
          <div className="wallet-nav">
            <h1 className="sr-only">Wallet</h1>
            <nav aria-label="Wallet navigation">
              {[
                ["/wallet", "Portfolio"],
                ["/wallet/send", "Send"],
                ["/wallet/delegate", "Delegate"],
              ].map(([to, label]) => (
                <NavLink
                  key={to}
                  end={to !== "/wallet/tools"}
                  to={to}
                  className={({ isActive }) => (isActive ? "selected" : "")}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
