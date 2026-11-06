import { clearEpochSummaryCache } from "../explorer/epochSummary";
import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTipStore } from "../../stores/tipStore";

export function isMutableChainQuery(key: QueryKey, rollback = false): boolean {
  if (key[0] === "wallet-tools")
    return rollback && key[1] === "confirmation";
  if (key[0] !== "dingo") return false;
  switch (key[1]) {
    case "node-health":
    case "recent-blocks":
    case "epoch-clock-tip":
    case "lookup":
      return true;
    case "markets":
    case "holder-results":
    case "delegation-confirmation":
    case "handle":
    case "vote-confirmation":
    case "holder-answer":
    case "reward-withdrawal":
      return rollback;
    case "surveys":
      return rollback && ["confirmation", "detail", "directory", "results"].includes(String(key[2]));
    case "asset":
      return rollback && (key.length === 3 || key[3] === "holder-map" || key[3] === "mint-map");
    case "policy-assets":
    case "metadata-label":
    case "proposals":
    case "committee":
      return rollback;
    case "network":
      return rollback && key.length === 2;
    case "block":
      return key.length === 3;
    case "tx":
      return key.length === 3 || key[3] === "utxos";
    case "address":
    case "account":
      return rollback || key[3] !== "journey";
    case "epoch":
      return rollback && (key.length === 3 || key[3] === "parameters");
    case "pool":
      return key.length === 3 || key[3] === "delegators" || (rollback && key[3] === "producer-block");
    case "drep":
      return key.length === 3 || (rollback && key[3] === "delegators");
    case "proposal":
      return rollback && (key.length === 3 || key[3] === "chamber-votes");
    case "wallet":
      return ["account", "associated-addresses", "stake-utxos", "recent-rewards"].includes(String(key[2]));
    default:
      return false;
  }
}

export function useChainReconciliation() {
  const client = useQueryClient();
  useEffect(() => useTipStore.subscribe((state, previous) => {
    if (state.revision === previous.revision) return;
    const rollback = state.lastAction !== "apply";
    const filter = {
      predicate: (query: { queryKey: QueryKey }) => isMutableChainQuery(query.queryKey, rollback),
    };
    if (rollback) {
      // A reconnect after an observed tip may have skipped a rollback that
      // happened while the stream was down, so stored summaries are suspect.
      if (
        state.lastAction === "undo" ||
        state.lastAction === "reset" ||
        (state.lastAction === "connect" && previous.tip !== null)
      )
        clearEpochSummaryCache();
      void client.resetQueries(filter);
    }
    else void client.invalidateQueries({ ...filter, type: "active" });
  }), [client]);
}
