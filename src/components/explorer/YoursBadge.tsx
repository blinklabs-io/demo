import { useWalletStore } from "../../stores/walletStore";

// Small badge shown next to an address/account when it belongs to the
// connected wallet. Explorer only ever reads from the wallet store.
export function YoursBadge({ value }: { value: string | null | undefined }) {
  const usedAddresses = useWalletStore((state) => state.usedAddresses);
  const changeAddress = useWalletStore((state) => state.changeAddress);
  const rewardAddress = useWalletStore((state) => state.rewardAddress);

  if (
    !value ||
    (!usedAddresses.includes(value) &&
      value !== changeAddress &&
      value !== rewardAddress)
  ) {
    return null;
  }

  return (
    <span className="ml-2 rounded-full bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-300">
      Yours
    </span>
  );
}
