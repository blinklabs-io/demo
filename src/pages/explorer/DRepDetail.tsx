import { useParams } from "react-router";

export default function DRepDetail() {
  const { drepId } = useParams();
  return <p className="text-slate-400">DRep {drepId} — coming soon.</p>;
}
