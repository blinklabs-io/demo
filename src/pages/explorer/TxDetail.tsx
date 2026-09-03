import { useParams } from "react-router";

export default function TxDetail() {
  const { hash } = useParams();
  return <p className="text-slate-400">Transaction {hash} — coming soon.</p>;
}
