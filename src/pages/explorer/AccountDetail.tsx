import { useParams } from "react-router";

export default function AccountDetail() {
  const { stakeAddress } = useParams();
  return (
    <p className="text-slate-400">Account {stakeAddress} — coming soon.</p>
  );
}
