import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NETWORK_STORAGE_KEY, selectedDingoNetwork, urlDingoNetwork } from "./lib/dingo/networks";
import NetworkRecovery from "./NetworkRecovery";
import "./index.css";
import "./experiences.css";
import "./components/wallet/studio.css";
import "./components/chain/chain.css";


const root = createRoot(document.getElementById("root")!);
async function start() {
  try {
    const selected = selectedDingoNetwork();
    if (urlDingoNetwork(window.location.search) !== null)
      window.localStorage.setItem(NETWORK_STORAGE_KEY, selected.id);
  } catch {
    root.render(<StrictMode><NetworkRecovery /></StrictMode>);
    return;
  }
  const { default: App } = await import("./App.tsx");
  root.render(<StrictMode><App /></StrictMode>);
}
void start();
