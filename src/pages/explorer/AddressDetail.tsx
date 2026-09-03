import { useParams } from "react-router";

export default function AddressDetail() {
  const { address } = useParams();
  return <p className="text-slate-400">Address {address} — coming soon.</p>;
}
