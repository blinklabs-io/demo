import { useDraftGuard } from "../../lib/useDraftGuard";
import { governanceError } from "../../lib/dingo/governanceVote";
import { PageIntro } from "../../components/explorer/Visuals";
import { WalletConnectSummary } from "../../components/layout/WalletConnectSummary";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { HashLink } from "../../components/explorer/HashLink";
import { formatAda } from "../../lib/format";
import {
  delegationAccount,
  prepareDelegation,
  submitDelegation,
  type DelegationTarget,
  type PreparedDelegation,
} from "../../lib/dingo/delegation";

export default function WalletDelegate() {
  const [search] = useSearchParams();
  const pool = search.get("pool") ?? "";
  const drep = search.get("drep") ?? "";
  return (
    <DelegationWorkspace
      key={JSON.stringify([pool, drep])}
      initialPool={pool}
      initialDrep={drep}
    />
  );
}

function DelegationWorkspace({ initialPool, initialDrep }: {
  initialPool: string;
  initialDrep: string;
}) {
  const connection = useWalletStore((s) => s.connectionId);
  const [poolId, setPoolId] = useState(initialPool);
  const [drepId, setDrepId] = useState(initialDrep);
  return (
    <DelegationForm
      key={connection}
      connection={connection}
      poolId={poolId}
      drepId={drepId}
      setPoolId={setPoolId}
      setDrepId={setDrepId}
    />
  );
}
function DelegationForm({ connection, poolId, drepId, setPoolId, setDrepId }: {
  connection: number;
  poolId: string;
  drepId: string;
  setPoolId: (value: string) => void;
  setDrepId: (value: string) => void;
}) {
  const assertActive = useDraftGuard("delegation");
  const status = useWalletStore((state) => state.status);
  const walletApi = useWalletStore((state) => state.walletApi);
  const rewardAddress = useWalletStore((state) => state.rewardAddress);
  const [draft, setDraft] = useState<PreparedDelegation | null>(null);
  const revision = useRef(0);
  const client = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ["dingo", "account", rewardAddress],
    queryFn: () => delegationAccount(rewardAddress!),
    enabled: !!rewardAddress,
  });
  const assertSession = (expectedRevision: number) => {
    assertActive();
    const current = useWalletStore.getState();
    if (
      current.status !== "connected" ||
      current.walletApi !== walletApi ||
      current.connectionId !== connection ||
      current.rewardAddress !== rewardAddress ||
      revision.current !== expectedRevision
    )
      throw new Error(
        "Wallet connection or delegation changed. Review a new draft.",
      );
  };
  const prepare = useMutation({
    mutationFn: async (target: DelegationTarget) => {
      if (!walletApi || !rewardAddress)
        throw new Error("Connect a wallet first.");
      const expected = revision.current;
      try {
        return {
          draft: await prepareDelegation(walletApi, rewardAddress, target, () =>
            assertSession(expected),
          ),
          revision: expected,
        };
      } catch (error) {
        throw governanceError(error, "Unable to prepare the delegation.");
      }
    },
    onSuccess: (result) => {
      assertSession(result.revision);
      setDraft(result.draft);
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!draft || !walletApi) throw new Error("Review a draft first.");
      const expected = revision.current;
      try {
        return await submitDelegation(walletApi, draft, () =>
          assertSession(expected),
        );
      } catch (error) {
        throw governanceError(
          error,
          "Unable to sign or submit the delegation.",
        );
      } finally {
        setDraft(null);
      }
    },
    onSuccess: () => {
      void useWalletStore.getState().refreshBalance();
      void accountQuery.refetch();
      void client.invalidateQueries({ queryKey: ["dingo", "wallet"] });
    },
  });
  const busy = prepare.isPending || submit.isPending;
  function edit(update: () => void) {
    revision.current++;
    setDraft(null);
    prepare.reset();
    submit.reset();
    update();
  }
  function review(target: DelegationTarget) {
    if (busy) return;
    setDraft(null);
    submit.reset();
    prepare.mutate(target);
  }
  const connected = status === "connected";
  const registered = accountQuery.data?.registered ?? false;
  const accountUnavailable = !accountQuery.isSuccess;
  const registerNote = !connected || !rewardAddress || !accountQuery.isSuccess
    ? ""
    : registered
      ? ""
      : " Your stake credential is not registered yet; the transaction will register and delegate it.";

  return (
    <div className="wallet-workbench delegate-workbench flex flex-col gap-6">
      <PageIntro
        eyebrow="Stake pools & governance"
        title="Delegation"
        detail="Choose a stake pool or representative. Connect only when you are ready to review and sign."
        symbol="⬡"
        action={<WalletConnectSummary />}
      />
      {connected && !rewardAddress && (
        <p role="alert" className="tool-error">
          This wallet did not provide a reward address. Delegation cannot be built.
        </p>
      )}
      <div>
        <p className="text-sm text-slate-500">
          {accountQuery.isLoading && "Checking current delegation…"}
          {accountQuery.isSuccess && (
            <>
              Currently delegated to pool{" "}
              {accountQuery.data?.pool_id ? (
                <HashLink
                  kind="pool"
                  id={accountQuery.data.pool_id}
                  visible={8}
                />
              ) : (
                "none"
              )}
              , DRep{" "}
              {accountQuery.data?.drep_id ? (
                <HashLink
                  kind="drep"
                  id={accountQuery.data.drep_id}
                  visible={8}
                />
              ) : (
                "none"
              )}
              .
            </>
          )}
        </p>
        {accountQuery.error && (
          <p role="alert" className="tool-error">
            Unable to read current delegation: {accountQuery.error.message}{" "}
            <button type="button" onClick={() => void accountQuery.refetch()}>
              Retry
            </button>
          </p>
        )}
      </div>

      <div className="wallet-form-card">
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          Stake pool delegation
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            review({ kind: "pool", id: poolId });
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
              disabled={busy}
              onChange={(event) => edit(() => setPoolId(event.target.value))}
              placeholder="pool1..."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !connected || !rewardAddress || accountUnavailable}
            className="self-start rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
          >
            {prepare.isPending ? "Building with Dingo…" : "Review delegation"}
          </button>
        </form>
      </div>

      <div className="wallet-form-card">
        <h2 className="mb-2 text-sm font-medium text-slate-300">
          DRep vote delegation
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            review({ kind: "drep", id: drepId });
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
              disabled={busy}
              onChange={(event) => edit(() => setDrepId(event.target.value))}
              placeholder="drep1..."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !connected || !rewardAddress || accountUnavailable}
            className="self-start rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-50"
          >
            {prepare.isPending ? "Building with Dingo…" : "Review delegation"}
          </button>
        </form>
      </div>
      {draft && (
        <section
          className="tool-review tool-transaction"
          aria-label="Delegation review"
        >
          <span className="eyebrow">Unsigned delegation · Preview</span>
          <h3>
            {draft.target.kind === "pool"
              ? "Stake pool delegation"
              : "DRep vote delegation"}
          </h3>
          <dl className="tool-facts">
            <div>
              <dt>Target</dt>
              <dd>
                <HashLink kind={draft.target.kind} id={draft.target.id} full />
              </dd>
            </div>
            <div>
              <dt>Stake account</dt>
              <dd>
                <HashLink kind="account" id={draft.address} full />
              </dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>{formatAda(draft.tx.body().fee())}</dd>
            </div>
            <div>
              <dt>Registration deposit</dt>
              <dd>{formatAda(draft.deposit)}</dd>
            </div>
            <div>
              <dt>Stake registration</dt>
              <dd>
                {draft.registered
                  ? "Already registered"
                  : "Included in this transaction"}
              </dd>
            </div>
          </dl>
          <p>
            Your wallet approves this fixed draft. Edits require a new review.
            Submission goes through Dingo.
          </p>
          <div className="tool-button-row">
            <button
              className="tool-primary"
              disabled={busy}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Waiting for wallet…" : "Sign & submit"}
            </button>
            <button disabled={busy} onClick={() => edit(() => {})}>
              Discard draft
            </button>
          </div>
        </section>
      )}
      {(prepare.error || submit.error) && (
        <p className="tool-error" role="alert">
          {(prepare.error || submit.error)!.message}
        </p>
      )}
      {submit.data && (
        <p role="status">
          Submitted to Dingo.{" "}
          <Link to={`/explorer/tx/${submit.data}`}>View transaction →</Link>
        </p>
      )}
    </div>
  );
}
