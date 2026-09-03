import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";
import { useMempoolStore } from "../../stores/mempoolStore";

type Resolution = { kind: "tx" | "block" } | { kind: "none" };

async function resolve(hash: string): Promise<Resolution> {
  try {
    await blockfrostFetch(`/api/v0/txs/${hash}`);
    return { kind: "tx" };
  } catch (err) {
    if (!(err instanceof BlockfrostError) || err.status !== 404) {
      throw err;
    }
  }
  try {
    await blockfrostFetch(`/api/v0/blocks/${hash}`);
    return { kind: "block" };
  } catch (err) {
    if (!(err instanceof BlockfrostError) || err.status !== 404) {
      throw err;
    }
  }
  return { kind: "none" };
}

export default function LookupResolver() {
  const { hash } = useParams();
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
    enabled: Boolean(hash) && !isPendingTx,
  });

  useEffect(() => {
    if (!hash) return;
    if (isPendingTx) {
      navigate(`/explorer/tx/${hash}`, { replace: true });
      return;
    }
    if (!data) return;
    if (data.kind === "tx") {
      navigate(`/explorer/tx/${hash}`, { replace: true });
    } else if (data.kind === "block") {
      navigate(`/explorer/block/${hash}`, { replace: true });
    }
  }, [data, hash, isPendingTx, navigate]);

  if (error) {
    return (
      <p className="text-sm text-red-400">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }
  if (data?.kind === "none") {
    return (
      <p className="text-sm text-slate-500">
        No transaction or block matches "{hash}".
      </p>
    );
  }
  return <p className="text-sm text-slate-500">Looking up {hash}…</p>;
}
