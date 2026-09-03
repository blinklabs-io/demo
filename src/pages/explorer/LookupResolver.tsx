import { useParams } from "react-router";

// A 64-char hex string from the global search bar could be a tx hash or a
// block hash. This page should try GET /api/v0/txs/{hash} first, and on 404
// fall back to GET /api/v0/blocks/{hash}, then redirect to the matching
// detail route.
export default function LookupResolver() {
  const { hash } = useParams();
  return <p className="text-slate-400">Resolving {hash} — coming soon.</p>;
}
