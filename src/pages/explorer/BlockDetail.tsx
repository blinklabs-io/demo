import { useParams } from "react-router";

export default function BlockDetail() {
  const { id } = useParams();
  return <p className="text-slate-400">Block {id} — coming soon.</p>;
}
