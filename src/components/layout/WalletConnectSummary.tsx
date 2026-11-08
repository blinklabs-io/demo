import { DINGO_NETWORK } from "../../lib/dingo/config";
import { HashLink } from "../explorer/HashLink";
import { useEffect, useId, useRef, useState } from "react";
import { useWalletStore } from "../../stores/walletStore";
import { shortenHash } from "../../lib/format";

export function WalletConnectSummary() {
  const noticeId = useId();
  const mainnet = DINGO_NETWORK.id === "mainnet";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const status = useWalletStore((state) => state.status);
  const walletName = useWalletStore((state) => state.walletName);
  const changeAddress = useWalletStore((state) => state.changeAddress);
  const error = useWalletStore((state) => state.error);
  const listAvailableWallets = useWalletStore(
    (state) => state.listAvailableWallets,
  );
  const connect = useWalletStore((state) => state.connect);
  const disconnect = useWalletStore((state) => state.disconnect);

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

  if (status === "connected") {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 hover:border-slate-500"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {walletName}
          <span className="text-slate-400" title={changeAddress ?? undefined}>
            {changeAddress ? shortenHash(changeAddress, 6) : "Connected"}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm shadow-lg">
            <p className="text-slate-400">Change address</p>
            <p className="mt-1 break-all text-slate-200">
              {changeAddress && (
                <HashLink kind="address" id={changeAddress} full />
              )}
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
        <div className={`absolute right-0 z-10 mt-2 ${mainnet ? "w-80 max-w-[calc(100vw-2rem)]" : "w-56"} rounded-md border border-slate-700 bg-slate-900 p-2 text-sm shadow-lg`}>
          {mainnet && (
            <div id={noticeId} role="note" className="mb-2 rounded-md border border-amber-500/50 bg-amber-950/40 p-3 text-amber-100">
              <strong className="block">Real funds on Mainnet</strong>
              <p className="mt-1">Mainnet uses real ADA and tokens. Transactions can result in loss of funds. Use at your own risk. Protocol integrations are not endorsements, and this demo does not provide financial advice.</p>
            </div>
          )}
          {availableWallets.length === 0 && (
            <p className="px-2 py-1.5 text-slate-500">
              No CIP-30 wallets detected.
            </p>
          )}
          {availableWallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              aria-describedby={mainnet ? noticeId : undefined}
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
      {status === "connecting" && (
        <button
          type="button"
          aria-label="Cancel wallet connection"
          title="Cancel connection"
          className="ml-2 p-2 text-slate-400"
          onClick={() => {
            disconnect();
            setOpen(false);
          }}
        >
          ×
        </button>
      )}
      {error && (
        <div
          className="mt-2 flex max-w-sm items-start gap-2 text-xs text-red-400"
          role="alert"
        >
          <p>{error}</p>
          <button
            type="button"
            aria-label="Disconnect wallet"
            title="Dismiss wallet connection"
            className="shrink-0 rounded border border-slate-700 px-2 py-1 text-slate-300"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
