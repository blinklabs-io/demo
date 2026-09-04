import { useEffect, useRef, useState } from "react";
import { useWalletStore } from "../../stores/walletStore";
import { formatAda, shortenHash } from "../../lib/format";

export function WalletConnectSummary() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const status = useWalletStore((state) => state.status);
  const walletName = useWalletStore((state) => state.walletName);
  const changeAddress = useWalletStore((state) => state.changeAddress);
  const balanceLovelace = useWalletStore((state) => state.balanceLovelace);
  const error = useWalletStore((state) => state.error);
  const listAvailableWallets = useWalletStore(
    (state) => state.listAvailableWallets,
  );
  const connect = useWalletStore((state) => state.connect);
  const disconnect = useWalletStore((state) => state.disconnect);
  const restoreConnection = useWalletStore((state) => state.restoreConnection);

  useEffect(() => {
    void restoreConnection();
  }, [restoreConnection]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (status === "connected" && changeAddress) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 hover:border-slate-500"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {walletName}
          {balanceLovelace !== null && (
            <span className="text-slate-400">
              {formatAda(balanceLovelace)}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm shadow-lg">
            <p className="text-slate-400">Change address</p>
            <p className="mt-1 break-all text-slate-200">
              {shortenHash(changeAddress, 12)}
            </p>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="mt-3 w-full rounded-md border border-slate-700 px-2 py-1 text-left text-red-300 hover:bg-red-950"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  const availableWallets = listAvailableWallets();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={status === "connecting"}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
      {open && status !== "connecting" && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-slate-700 bg-slate-900 p-2 text-sm shadow-lg">
          {availableWallets.length === 0 && (
            <p className="px-2 py-1.5 text-slate-500">
              No CIP-30 wallets detected.
            </p>
          )}
          {availableWallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              onClick={() => {
                void connect(wallet.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-100 hover:bg-slate-800"
            >
              {wallet.icon && (
                <img src={wallet.icon} alt="" className="h-4 w-4" />
              )}
              {wallet.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 max-w-56 text-xs text-red-400">{error}</p>}
    </div>
  );
}
