import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import { readWalletDRep } from "./governanceVote";

export function useWalletDRep() {
  const api = useWalletStore((state) => state.walletApi);
  const connectionId = useWalletStore((state) => state.connectionId);
  return useQuery({
    queryKey: ["dingo", "wallet", "drep-role", connectionId],
    enabled: Boolean(api?.cip95),
    queryFn: ({ signal }) => readWalletDRep(api!, signal),
    staleTime: 60_000,
    retry: false,
  });
}
