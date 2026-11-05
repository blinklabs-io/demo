import { DINGO_NETWORKS, isDingoNetworkId } from "../../lib/dingo/networks";
import { useState } from "react";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { changeDingoNetwork } from "../../lib/dingo/networkSelection";

export function NetworkSwitcher() {
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  return <div className="network-switcher">
    <label>
      <span className="sr-only">Cardano network</span>
      <select aria-label="Cardano network" value={DINGO_NETWORK.id} disabled={switching}
        onChange={(event) => {
          const next = event.target.value;
          if (!isDingoNetworkId(next)) return;
          setError("");
          setSwitching(true);
          try { changeDingoNetwork(next); }
          catch (cause) {
            setSwitching(false);
            setError(cause instanceof Error ? cause.message : "Could not switch networks.");
          }
        }}>
        {Object.values(DINGO_NETWORKS).map((network) => <option key={network.id} value={network.id}>{network.label}</option>)}
      </select>
    </label>
    {switching && <span className="sr-only" role="status">Switching networks…</span>}
    {error && <p role="alert" className="network-switch-error">{error}</p>}
  </div>;
}
