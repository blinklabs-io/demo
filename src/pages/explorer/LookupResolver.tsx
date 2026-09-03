import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch, BlockfrostError } from "../../lib/dingo/blockfrost";

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

  const { data, error } = useQuery({
    queryKey: ["dingo", "lookup", hash],
    queryFn: () => resolve(hash!),
    enabled: Boolean(hash),
  });

  useEffect(() => {
    if (!data || !hash) return;
    if (data.kind === "tx") {
      navigate(`/explorer/tx/${hash}`, { replace: true });
    } else if (data.kind === "block") {
      navigate(`/explorer/block/${hash}`, { replace: true });
    }
  }, [data, hash, navigate]);

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
