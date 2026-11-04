import { useDraftGuard } from "../../lib/useDraftGuard";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import {
  isRetryableConfirmation,
  readTransactionConfirmation,
} from "../../lib/dingo/transactionConfirmation";
import { walletStakeAccount } from "../../lib/dingo/wallet";
import {
  prepareRewardWithdrawal,
  submitRewardWithdrawal,
  type PreparedWithdrawal,
} from "../../lib/dingo/rewardWithdrawal";
import { governanceError } from "../../lib/dingo/governanceVote";
import { formatAda } from "../../lib/format";
import { Panel } from "./Panel";
import { HashLink } from "./HashLink";

export function WalletRewards({ address }: { address?: string }) {
  const connectionId = useWalletStore((state) => state.connectionId);
  return (
    <RewardsForm
      key={`${connectionId}:${address}`}
      address={address}
      connectionId={connectionId}
    />
  );
}
function RewardsForm({
  address,
  connectionId,
}: {
  address?: string;
  connectionId: number;
}) {
  const assertActive = useDraftGuard("reward-withdrawal");
  const api = useWalletStore((state) => state.walletApi);
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState<PreparedWithdrawal | null>(null);
  const account = useQuery({
    queryKey: ["dingo", "wallet", "account", address],
    queryFn: ({ signal }) => walletStakeAccount(address!, signal),
    enabled: Boolean(address),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  function assertConnection() {
    assertActive();
    const current = useWalletStore.getState();
    if (
      current.status !== "connected" ||
      current.walletApi !== api ||
      current.connectionId !== connectionId
    )
      throw new Error(
        "Your wallet connection changed. Reconnect and review the withdrawal again.",
      );
  }
  const prepare = useMutation({
    mutationFn: async () => {
      if (!api || !address)
        throw new Error("Connect a wallet with a reward address.");
      try {
        return await prepareRewardWithdrawal(api, address, assertConnection);
      } catch (error) {
        throw governanceError(
          error,
          "Unable to create a withdrawal transaction.",
        );
      }
    },
    onSuccess: (draft) => {
      assertConnection();
      setPrepared(draft);
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !prepared)
        throw new Error("Create a withdrawal transaction first.");
      try {
        return await submitRewardWithdrawal(api, prepared, assertConnection);
      } catch (error) {
        throw governanceError(
          error,
          "Unable to sign or submit the withdrawal.",
        );
      } finally {
        setPrepared(null);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dingo", "wallet"] });
      void useWalletStore.getState().refreshBalance();
    },
  });
  const confirmation = useQuery({
    queryKey: ["dingo", "reward-withdrawal", submit.data],
    queryFn: ({ signal }) => readTransactionConfirmation(submit.data!, signal),
    enabled: Boolean(submit.data),
    retry: false,
    refetchInterval: (query) =>
      query.state.data || query.state.error ? false : 15_000,
  });
  useEffect(() => {
    if (confirmation.data) {
      void queryClient.invalidateQueries({ queryKey: ["dingo", "wallet"] });
      void useWalletStore.getState().refreshBalance();
    }
  }, [confirmation.data, queryClient]);
  const confirmationFailed =
    Boolean(confirmation.error) && !isRetryableConfirmation(confirmation.error);
  const awaitingConfirmation =
    submit.isSuccess && !confirmation.data && !confirmationFailed;
  const busy = prepare.isPending || submit.isPending;
  const amount = account.data?.withdrawable_amount;
  const available =
    amount !== undefined && /^\d+$/.test(amount) ? BigInt(amount) : null;
  const error = account.error || prepare.error || submit.error;
  return (
    <Panel
      title="Staking rewards"
      action={
        <button
          type="button"
          className="text-xs text-teal-300"
          disabled={!address || busy || account.isFetching}
          onClick={() => void account.refetch()}
        >
          {account.isFetching ? "Checking…" : "Refresh rewards"}
        </button>
      }
    >
      <div className="wallet-rewards">
        <div className="wallet-rewards-balance">
          <span className="eyebrow">Available to withdraw</span>
          <strong>{available === null ? "—" : formatAda(available)}</strong>
          <p>
            {!address
              ? "This wallet has no reward address."
              : account.isPending
                ? "Checking your stake account…"
                : account.isSuccess && !account.data
                  ? "Stake account not registered."
                  : available === 0n
                    ? "No rewards available yet."
                    : "Move staking rewards into your wallet’s spendable balance."}
          </p>
        </div>
        {!prepared && (
          <button
            type="button"
            className="wallet-rewards-create"
            disabled={
              busy ||
              !api ||
              !available ||
              account.isError ||
              awaitingConfirmation
            }
            onClick={() => {
              submit.reset();
              prepare.mutate();
            }}
          >
            {prepare.isPending
              ? "Creating transaction…"
              : awaitingConfirmation
                ? "Withdrawal submitted"
                : "Create withdrawal transaction →"}
          </button>
        )}
      </div>
      {prepared && (
        <div className="withdrawal-review">
          <h3>Review reward withdrawal</h3>
          <dl>
            <div>
              <dt>Rewards</dt>
              <dd>{formatAda(prepared.amount)}</dd>
            </div>
            <div>
              <dt>Transaction fee</dt>
              <dd>{formatAda(prepared.tx.body().fee())}</dd>
            </div>
            <div>
              <dt>Balance increase after fee</dt>
              <dd>{formatAda(prepared.amount - prepared.tx.body().fee())}</dd>
            </div>
          </dl>
          <p>
            Withdraw all available rewards to your connected wallet. Your stake
            registration and delegations stay in place. Submitted through Dingo
            on Preview.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="wallet-rewards-create"
              disabled={busy}
              onClick={() => submit.mutate()}
            >
              {submit.isPending
                ? "Waiting for wallet…"
                : "Sign & submit withdrawal"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                prepare.reset();
                submit.reset();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error.message}
        </p>
      )}
      {confirmation.error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {isRetryableConfirmation(confirmation.error)
            ? `Unable to check confirmation: ${confirmation.error.message} `
            : `Withdrawal failed: ${confirmation.error.message} `}
          {isRetryableConfirmation(confirmation.error) && (
            <button type="button" onClick={() => void confirmation.refetch()}>
              Retry confirmation
            </button>
          )}
        </p>
      )}
      {submit.data && (
        <div role="status" className="mt-4 text-sm text-teal-200">
          {confirmation.data
            ? "Withdrawal confirmed."
            : confirmationFailed
              ? "Withdrawal failed."
              : "Withdrawal submitted. Waiting for confirmation."}{" "}
          <HashLink kind="tx" id={submit.data} />
        </div>
      )}
    </Panel>
  );
}
