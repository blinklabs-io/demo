import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import {
  getDingoProvider,
  summarizeDingoAddress,
  summarizeDingoStakeCredential,
  stakeCredentialHashFor,
  type DingoUtxoSummary,
} from "../../lib/dingo/utxorpc/provider";
import { formatAda, shortenHash } from "../../lib/format";

function summaryLabel(summary: DingoUtxoSummary): string {
  const utxoLabel = summary.utxoCount === 1 ? "UTxO" : "UTxOs";
  const prefix = summary.truncated
    ? `first ${summary.utxoCount}`
    : `${summary.utxoCount}`;
  return `${formatAda(summary.lovelace)} across ${prefix} ${utxoLabel}`;
}

function DingoWalletView({ changeAddress }: { changeAddress: string }) {
  const addressQuery = useQuery({
    queryKey: ["dingo", "wallet-view", "address", changeAddress],
    queryFn: () =>
      summarizeDingoAddress(
        getDingoProvider(),
        Core.Address.fromBech32(changeAddress),
      ),
  });

  const stakeCredentialHash = stakeCredentialHashFor(
    Core.Address.fromBech32(changeAddress),
  );

  const stakeQuery = useQuery({
    queryKey: ["dingo", "wallet-view", "stake", stakeCredentialHash],
    queryFn: () =>
      summarizeDingoStakeCredential(getDingoProvider(), stakeCredentialHash!),
    enabled: Boolean(stakeCredentialHash),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-slate-800 p-3 text-sm">
        <p className="text-slate-500">
          Dingo UTxOs (exact address match)
        </p>
        <p className="mt-1 text-slate-200">
          {addressQuery.isLoading && "Loading…"}
          {addressQuery.error &&
            (addressQuery.error instanceof Error
              ? addressQuery.error.message
              : "Query failed.")}
          {addressQuery.data && summaryLabel(addressQuery.data)}
        </p>
      </div>
      <div className="rounded-md border border-slate-800 p-3 text-sm">
        <p className="text-slate-500" title="UTxO RPC reports UTxOs only; delegation and rewards need node-to-client LocalStateQuery.">
          Dingo UTxOs (stake credential, all address forms)
        </p>
        <p className="mt-1 text-slate-200">
          {!stakeCredentialHash && "No delegation part on this address."}
          {stakeQuery.isLoading && "Loading…"}
          {stakeQuery.error &&
            (stakeQuery.error instanceof Error
              ? stakeQuery.error.message
              : "Query failed.")}
          {stakeQuery.data && summaryLabel(stakeQuery.data)}
        </p>
      </div>
    </div>
  );
}

export default function WalletHome() {
  const status = useWalletStore((state) => state.status);
  const changeAddress = useWalletStore((state) => state.changeAddress);
  const usedAddresses = useWalletStore((state) => state.usedAddresses);
  const rewardAddress = useWalletStore((state) => state.rewardAddress);
  const balanceLovelace = useWalletStore((state) => state.balanceLovelace);

  if (status !== "connected" || !changeAddress) {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Connect a wallet from the header to view your portfolio and build
        transactions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-slate-800 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          CIP-30 reported balance
        </p>
        <p className="mt-1 text-2xl font-semibold text-white">
          {balanceLovelace !== null ? formatAda(balanceLovelace) : "—"}
        </p>
        <dl className="mt-4 grid gap-2 text-sm">
          <div>
            <dt className="text-slate-500">Change address</dt>
            <dd className="break-all text-slate-300">{changeAddress}</dd>
          </div>
          {rewardAddress && (
            <div>
              <dt className="text-slate-500">Reward address</dt>
              <dd className="break-all text-slate-300">{rewardAddress}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Used addresses</dt>
            <dd className="text-slate-300">
              {usedAddresses.length} ({shortenHash(changeAddress, 10)}
              {usedAddresses.length > 1 ? ", …" : ""})
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          What Dingo sees, independently of CIP-30
        </h2>
        <DingoWalletView changeAddress={changeAddress} />
      </div>

      <div className="flex gap-3">
        <Link
          to="/wallet/send"
          className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
        >
          Send
        </Link>
        <Link
          to="/wallet/swap"
          className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
        >
          SundaeSwap
        </Link>
        <Link
          to="/wallet/delegate"
          className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
        >
          Delegate
        </Link>
      </div>
    </div>
  );
}
