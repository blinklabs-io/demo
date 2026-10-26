import { EmptyState } from "../../components/explorer/Visuals";
import { Panel } from "../../components/explorer/Panel";
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { queryClient } from "../../lib/queryClient";
import { useMempoolStore } from "../../stores/mempoolStore";

type Resolution = { kind: "tx" | "block" | "asset" | "none" };

async function resolve(hash: string): Promise<Resolution> {
  const candidates = [
    ["tx", `/api/v0/txs/${hash}`],
    ["block", `/api/v0/blocks/${hash}`],
    ["asset", `/api/v0/assets/${hash}`],
  ] as const;

  for (const [kind, path] of candidates) {
    try {
      if (kind === "asset") {
        await queryClient.fetchQuery({
          queryKey: ["dingo", "asset", hash],
          queryFn: () => blockfrostFetch(path),
        });
      } else {
        await blockfrostFetch(path);
      }
      return { kind };
    } catch (error) {
      if (!(error instanceof BlockfrostError) || error.status !== 404) {
        throw error;
      }
    }
  }
  return { kind: "none" };
}

export default function LookupResolver() {
  const { hash: rawHash } = useParams();
  const hash = rawHash?.toLowerCase();
  const valid = Boolean(hash && /^[0-9a-f]{64}$/.test(hash));
  const navigate = useNavigate();
  // A hash sitting in Dingo's live mempool is unambiguously a pending tx -
  // route straight there without spending a Blockfrost round-trip on it.
  // TxDetail re-checks Blockfrost itself and only falls back to the pending
  // view if that 404s, so this is safe even against a moment-old mempool
  // snapshot for a tx that has since confirmed.
  const isPendingTx = useMempoolStore((state) =>
    hash ? state.pendingTxs.has(hash) : false,
  );

  const { data, error } = useQuery({
    queryKey: ["dingo", "lookup", hash],
    queryFn: () => resolve(hash!),
    enabled: valid && !isPendingTx,
  });

  useEffect(() => {
    if (!hash || !valid) return;
    if (isPendingTx) {
      navigate(`/explorer/tx/${hash}`, { replace: true });
      return;
    }
    if (!data) return;
    if (data.kind === "tx") {
      navigate(`/explorer/tx/${hash}`, { replace: true });
    } else if (data.kind === "block") {
      navigate(`/explorer/block/${hash}`, { replace: true });
    } else if (data.kind === "asset") {
      navigate(`/explorer/asset/${hash}`, { replace: true });
    }
  }, [data, hash, valid, isPendingTx, navigate]);

  if (!valid)
    return (
      <Panel>
        <EmptyState
          icon="⌕"
          title="That hash does not look right."
          detail="Transaction and block hashes contain 64 hexadecimal characters."
        />
      </Panel>
    );
  if (error) {
    return (
      <p className="text-sm text-red-400">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }
  if (data?.kind === "none") {
    return (
      <Panel>
        <EmptyState
          icon="⌕"
          title="No matching record."
          detail={`No transaction, block, or asset matches ${hash}.`}
        />
      </Panel>
    );
  }
  return (
    <Panel>
      <div role="status">
        <EmptyState
          icon="⌕"
          title="Searching the chain…"
          detail="Checking transactions, blocks, and assets through Dingo."
        />
      </div>
    </Panel>
  );
}
