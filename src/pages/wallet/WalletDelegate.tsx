import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { useWalletStore } from "../../stores/walletStore";
import {
  getBlaze,
  stakeCredentialFromRewardAddress,
  credentialFromDRepId,
} from "../../lib/dingo/blaze";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { HashLink } from "../../components/explorer/HashLink";

interface AccountResponse {
  registered: boolean;
  pool_id: string | null;
  drep_id: string | null;
}

interface DelegateResult {
  txHash: string;
}

export default function WalletDelegate() {
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const rewardAddress = useWalletStore((state) => state.rewardAddress);
  const refreshBalance = useWalletStore((state) => state.refreshBalance);

  const [poolId, setPoolId] = useState("");
  const [drepId, setDrepId] = useState("");

  const accountQuery = useQuery({
    queryKey: ["dingo", "account", rewardAddress],
    queryFn: async (): Promise<AccountResponse> => {
      try {
        return await blockfrostFetch<AccountResponse>(
          `/api/v0/accounts/${rewardAddress}`,
        );
      } catch (err) {
        // A stake credential Dingo has never indexed activity for 404s -
        // that's just "not registered yet", not an error.
        if (err instanceof BlockfrostError && err.status === 404) {
          return { registered: false, pool_id: null, drep_id: null };
        }
        throw err;
      }
    },
    enabled: Boolean(rewardAddress),
  });

  const poolMutation = useMutation<DelegateResult, Error>({
    mutationFn: async () => {
      if (!walletApi || !rewardAddress) {
        throw new Error("Connect a wallet first.");
      }
      if (!accountQuery.isSuccess || !accountQuery.data) {
        throw new Error(
          "Unable to verify the stake account registration status.",
        );
      }
      const trimmed = poolId.trim();
      if (!trimmed) {
        throw new Error("Enter a stake pool ID.");
      }
      const credential = stakeCredentialFromRewardAddress(rewardAddress);
      const { blaze } = await getBlaze(walletApi);
      let builder = blaze.newTransaction();
      if (!accountQuery.data.registered) {
        builder = builder.addRegisterStake(credential);
      }
      const tx = await builder
        .addDelegation(credential, Core.PoolId(trimmed))
        .complete();
      const signed = await blaze.signTransaction(tx);
      const txId = await blaze.submitTransaction(signed, true);
      return { txHash: txId.toString() };
    },
    onSuccess: () => {
      void refreshBalance();
      void accountQuery.refetch();
    },
  });

  const drepMutation = useMutation<DelegateResult, Error>({
    mutationFn: async () => {
      if (!walletApi || !rewardAddress) {
        throw new Error("Connect a wallet first.");
      }
      if (!accountQuery.isSuccess || !accountQuery.data) {
        throw new Error(
          "Unable to verify the stake account registration status.",
        );
      }
      if (!drepId.trim()) {
        throw new Error("Enter a DRep ID.");
      }
      const credential = stakeCredentialFromRewardAddress(rewardAddress);
      const drepCredential = credentialFromDRepId(drepId);
      const { blaze } = await getBlaze(walletApi);
      let builder = blaze.newTransaction();
      if (!accountQuery.data.registered) {
        builder = builder.addRegisterStake(credential);
      }
      const tx = await builder
        .addVoteDelegation(credential, drepCredential)
        .complete();
      const signed = await blaze.signTransaction(tx);
      const txId = await blaze.submitTransaction(signed, true);
      return { txHash: txId.toString() };
    },
    onSuccess: () => {
      void refreshBalance();
      void accountQuery.refetch();
    },
  });

  if (status !== "connected") {
    return (
      <div className="rounded-md border border-slate-800 p-6 text-center text-sm text-slate-400">
        Connect a wallet from the header to delegate.
      </div>
    );
  }

  if (!rewardAddress) {
    return (
      <div className="rounded-md border border-red-900 bg-red-950 p-6 text-center text-sm text-red-200">
        The connected wallet did not provide a reward address, so delegation
        is unavailable.
      </div>
    );
  }

  const registered = accountQuery.data?.registered ?? false;
  const accountUnavailable = !accountQuery.isSuccess;
  const registerNote = accountQuery.isLoading
    ? ""
    : accountQuery.isError
      ? " Unable to verify stake account registration."
      : registered
        ? ""
        : " Your stake credential isn't registered yet - this will register and delegate in one transaction.";

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="mb-1 text-lg font-semibold text-white">Delegate</h1>
        <p className="text-sm text-slate-500">
          {accountQuery.isLoading && "Checking current delegation…"}
          {!accountQuery.isLoading && (
            <>
              Currently delegated to pool{" "}
              {accountQuery.data?.pool_id ? (
                <HashLink kind="pool" id={accountQuery.data.pool_id} visible={8} />
              ) : (
                "none"
              )}
              , DRep{" "}
              {accountQuery.data?.drep_id ? (
                <HashLink kind="drep" id={accountQuery.data.drep_id} visible={8} />
              ) : (
                "none"
              )}
              .
            </>
          )}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          Stake pool delegation
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            poolMutation.reset();
            poolMutation.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">
              Pool ID.{registerNote}{" "}
              <Link to="/explorer/pools" className="underline">
                Browse pools
              </Link>
            </span>
            <input
              value={poolId}
              onChange={(event) => setPoolId(event.target.value)}
              placeholder="pool1..."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={poolMutation.isPending || accountUnavailable}
            className="self-start rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
          >
            {poolMutation.isPending
              ? "Building, signing, submitting…"
              : registered
                ? "Delegate"
                : "Register & delegate"}
          </button>
        </form>
        {poolMutation.isError && (
          <p className="mt-2 text-sm text-red-400">
            {poolMutation.error.message}
          </p>
        )}
        {poolMutation.isSuccess && (
          <p className="mt-2 text-sm text-emerald-400">
            Submitted.{" "}
            <Link
              to={`/explorer/tx/${poolMutation.data.txHash}`}
              className="underline"
            >
              View in Explorer
            </Link>
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          DRep vote delegation
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            drepMutation.reset();
            drepMutation.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">
              DRep ID.{registerNote}{" "}
              <Link to="/explorer/dreps" className="underline">
                Browse DReps
              </Link>
            </span>
            <input
              value={drepId}
              onChange={(event) => setDrepId(event.target.value)}
              placeholder="drep1..."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={drepMutation.isPending || accountUnavailable}
            className="self-start rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
          >
            {drepMutation.isPending
              ? "Building, signing, submitting…"
              : registered
                ? "Delegate"
                : "Register & delegate"}
          </button>
        </form>
        {drepMutation.isError && (
          <p className="mt-2 text-sm text-red-400">
            {drepMutation.error.message}
          </p>
        )}
        {drepMutation.isSuccess && (
          <p className="mt-2 text-sm text-emerald-400">
            Submitted.{" "}
            <Link
              to={`/explorer/tx/${drepMutation.data.txHash}`}
              className="underline"
            >
              View in Explorer
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
