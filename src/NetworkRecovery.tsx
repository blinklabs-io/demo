import { useState } from "react";
import { DINGO_NETWORKS, persistDingoNetwork, networkSearch, type DingoNetworkId } from "./lib/dingo/networks";

export default function NetworkRecovery() {
  const [error, setError] = useState("");
  function choose(network: DingoNetworkId) {
    try {
      persistDingoNetwork(network);
      window.location.assign(`/${networkSearch("", network)}`);
    } catch {
      setError("The browser could not open the selected network. Try choosing it again.");
    }
  }
  return (
    <main className="detail-showcase mx-auto max-w-xl p-8">
      <span className="eyebrow">Build with Dingo</span>
      <h1>Choose a Cardano network</h1>
      <p className="my-4 text-slate-300">Your network selection could not be used. Choose a network to continue.</p>
      <div className="flex gap-4">
        {Object.values(DINGO_NETWORKS).map((network) => (
          <button key={network.id} className="experience-primary" onClick={() => choose(network.id)}>{network.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
    </main>
  );
}
