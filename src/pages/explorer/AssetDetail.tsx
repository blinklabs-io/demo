import { useParams } from "react-router";

export default function AssetDetail() {
  const { assetId } = useParams();
  return <p className="text-slate-400">Asset {assetId} — coming soon.</p>;
}
