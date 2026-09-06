import { NavLink } from "react-router";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { WalletConnectSummary } from "./WalletConnectSummary";
import { ConnectDingoBanner } from "./ConnectDingoBanner";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { BlockfrostError } from "../../lib/dingo/blockfrost";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:text-slate-200"
  }`;

export function Header() {
  // Shares the query cache with NodeHealthStrip's own useNodeHealth() call
  // (same queryKey), so this doesn't add a second network request - it just
  // reads the error to drive the one global "Dingo unreachable" banner.
  const { error } = useNodeHealth();

  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="flex items-center gap-4 px-4 py-2 text-xs">
        <NodeHealthStrip />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-900 px-4 py-3">
        <span className="mr-2 text-lg font-semibold text-white">
          Dingo Demo
        </span>
        <nav className="flex items-center gap-1">
          <NavLink to="/explorer" className={navLinkClass}>
            Explorer
          </NavLink>
          <NavLink to="/wallet" className={navLinkClass}>
            Wallet
          </NavLink>
          <NavLink to="/api" className={navLinkClass}>
            API
          </NavLink>
        </nav>
        <GlobalLookup />
        <WalletConnectSummary />
      </div>
      {error instanceof BlockfrostError && error.status === 0 && (
        <ConnectDingoBanner error={error} />
      )}
    </header>
  );
}
