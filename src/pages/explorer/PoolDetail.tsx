import { useParams } from "react-router";

export default function PoolDetail() {
  const { poolId } = useParams();
  return <p className="text-slate-400">Pool {poolId} — coming soon.</p>;
}
