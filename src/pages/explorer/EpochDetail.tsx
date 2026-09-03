import { useParams } from "react-router";

export default function EpochDetail() {
  const { epoch } = useParams();
  return (
    <p className="text-slate-400">
      Epoch {epoch ?? "latest"} — coming soon.
    </p>
  );
}
