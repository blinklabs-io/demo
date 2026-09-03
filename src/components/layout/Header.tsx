import { NavLink } from "react-router";
import { NodeHealthStrip } from "./NodeHealthStrip";
import { GlobalLookup } from "./GlobalLookup";
import { WalletConnectSummary } from "./WalletConnectSummary";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:text-slate-200"
  }`;

export function Header() {
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
        </nav>
        <GlobalLookup />
        <WalletConnectSummary />
      </div>
    </header>
  );
}
