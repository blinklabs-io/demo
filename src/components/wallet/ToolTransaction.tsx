import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";
import { CopyButton } from "../explorer/CopyButton";
import { governanceError } from "../../lib/dingo/governanceVote";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import {
  prepareToolTransaction,
  submitToolTransaction,
  assetName,
  type PreparedTool,
  type ToolAction,
} from "../../lib/tools/transactions";
import { formatAda } from "../../lib/format";

export function ToolTransaction({
  action,
  ready = true,
}: {
  action: () => ToolAction;
  ready?: boolean;
}) {
  const api = useWalletStore((s) => s.walletApi),
    connectionId = useWalletStore((s) => s.connectionId);
  const [draft, setDraft] = useState<PreparedTool | null>(null);
  const [savedPolicy, setSavedPolicy] = useState<PreparedTool | null>(null);
  const queryClient = useQueryClient();
  const assertConnection = () => {
    const s = useWalletStore.getState();
    if (
      s.status !== "connected" ||
      s.walletApi !== api ||
      s.connectionId !== connectionId
    )
      throw new Error("Wallet connection changed. Review a new draft.");
  };
  const prepare = useMutation({
    mutationFn: async () => {
      if (!api) throw new Error("Connect a wallet first.");
      try {
        return await prepareToolTransaction(api, action(), assertConnection);
      } catch (e) {
        throw governanceError(e, "Unable to prepare this transaction.");
      }
    },
    onSuccess: setDraft,
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!api || !draft) throw new Error("Review a draft first.");
      try {
        const hash = await submitToolTransaction(api, draft, assertConnection);
        setSavedPolicy(draft.policyCbor ? draft : null);
        return hash;
      } catch (e) {
        throw governanceError(e, "Unable to sign or submit this transaction.");
      } finally {
        setDraft(null);
      }
    },
    onSuccess: () => {
      void useWalletStore.getState().refreshBalance();
      void queryClient.invalidateQueries({ queryKey: ["wallet-tools"] });
    },
  });
  const confirmation = useQuery({
    queryKey: ["wallet-tools", "confirmation", submit.data],
    enabled: !!submit.data,
    retry: false,
    refetchInterval: (q) => (q.state.data || q.state.error ? false : 10000),
    queryFn: async () => {
      try {
        const tx = await blockfrostFetch<{
          hash: string;
          block: string;
          valid_contract: boolean;
        }>(`/api/v0/txs/${submit.data}`);
        if (tx.hash !== submit.data || !tx.block || tx.valid_contract !== true)
          throw new Error("Transaction is not confirmed as valid.");
        void useWalletStore.getState().refreshBalance();
        void queryClient.invalidateQueries({
          queryKey: ["wallet-tools", "utxos"],
        });
        return tx;
      } catch (e) {
        if (e instanceof BlockfrostError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const busy = prepare.isPending || submit.isPending;
  const error = prepare.error ?? submit.error ?? confirmation.error;
  function downloadPolicy(policy: PreparedTool) {
    const data = JSON.stringify(
      {
        network: "preview",
        networkMagic: 2,
        policyId: policy.policyId,
        nativeScriptCbor: policy.policyCbor,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-${policy.policyId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!api)
    return (
      <div className="tool-connect">
        <p>Connect a Preview wallet to review and sign.</p>
        <WalletConnectSummary />
      </div>
    );
  return (
    <div className="tool-transaction">
      {!draft && !submit.data && (
        <button
          className="tool-primary"
          disabled={busy || !ready}
          onClick={() => prepare.mutate()}
        >
          {prepare.isPending ? "Building with Dingo…" : "Review transaction"}
        </button>
      )}
      {draft && (
        <section className="tool-review" aria-label="Transaction review">
          <div className="tool-review-heading">
            <div>
              <span className="eyebrow">Unsigned draft · Preview</span>
              <h3>Check the actual transaction.</h3>
            </div>
            <strong>
              {formatAda(draft.tx.body().fee())}
              <small>Network fee</small>
            </strong>
          </div>
          <div className="tool-flow">
            <span>
              {draft.tx.body().inputs().values().length}
              <small>Wallet inputs</small>
            </span>
            <b aria-hidden="true">→</b>
            <span>
              {draft.tx.body().outputs().length}
              <small>Outputs</small>
            </span>
            <b aria-hidden="true">→</b>
            <span>
              Dingo<small>Submission</small>
            </span>
          </div>
          <dl className="tool-facts">
            {draft.facts.map((fact, i) => (
              <div key={i}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <details open>
            <summary>Outputs, including change</summary>
            <div className="tool-output-list">
              {draft.tx
                .body()
                .outputs()
                .map((o, i) => (
                  <article key={i}>
                    <span className="eyebrow">Output {i + 1}</span>
                    <strong>{formatAda(o.amount().coin())}</strong>
                    <div className="tool-identifier">
                      <code>{o.address().toBech32()}</code>
                      <CopyButton
                        value={o.address().toBech32()}
                        label="recipient address"
                      />
                    </div>
                    {[...(o.amount().multiasset() ?? [])].map(([asset, n]) => (
                      <p key={asset}>
                        {n.toString()} raw units · {assetName(asset)}
                        <code>{asset}</code>
                      </p>
                    ))}
                  </article>
                ))}
            </div>
          </details>
          {draft.policyCbor && (
            <div className="tool-policy-save">
              <button type="button" onClick={() => downloadPolicy(draft)}>
                Download policy
              </button>
              <p>
                Keep this policy to burn tokens before its expiry. This is a
                native minting policy; it does not guarantee unique NFT supply.
              </p>
            </div>
          )}
          <p className="tool-public-note">
            {draft.action.kind === "proof" || draft.action.kind === "mint"
              ? "Metadata is public and permanent. "
              : ""}
            Your wallet will ask for approval. The reviewed draft is fixed;
            edits require a new draft.
          </p>
          <div className="tool-button-row">
            <button
              className="tool-primary"
              disabled={busy}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Waiting for wallet…" : "Sign & submit"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDraft(null);
                prepare.reset();
                submit.reset();
              }}
            >
              Discard draft
            </button>
          </div>
        </section>
      )}
      {submit.data && (
        <section className="tool-success" role="status">
          <strong>
            {confirmation.data ? "Confirmed on Preview" : "Submitted to Dingo"}
          </strong>
          <Link to={`/explorer/tx/${submit.data}`}>View transaction →</Link>
          <code>{submit.data}</code>
          {savedPolicy && (
            <button onClick={() => downloadPolicy(savedPolicy)}>
              Download minting policy
            </button>
          )}
          <button
            onClick={() => {
              submit.reset();
              prepare.reset();
              setSavedPolicy(null);
            }}
          >
            Start another transaction
          </button>
        </section>
      )}
      {error && (
        <p className="tool-error" role="alert">
          {error.message}
        </p>
      )}
      {confirmation.error && (
        <button onClick={() => void confirmation.refetch()}>
          Retry confirmation
        </button>
      )}
    </div>
  );
}
