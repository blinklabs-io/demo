import { useEffect } from "react";
import { Outlet } from "react-router";
import { Header } from "./Header";
import { useMempoolStore } from "../../stores/mempoolStore";

export function AppShell() {
  const startMempoolFeed = useMempoolStore((state) => state.start);

  useEffect(() => {
    // Started once here, not per-page: it's a standing subscription (a
    // ReadMempool snapshot plus a live WatchMempool stream), and AppShell is
    // mounted for the app's entire lifetime, so every page - not just a
    // dedicated mempool view - can read live pending-tx state for free.
    startMempoolFeed();
  }, [startMempoolFeed]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
