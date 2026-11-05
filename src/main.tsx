import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installNetworkRestoreGuard, persistDingoNetwork, selectedDingoNetwork, urlDingoNetwork } from "./lib/dingo/networks";
import NetworkRecovery from "./NetworkRecovery";
import "./index.css";
import "./experiences.css";
import "./components/wallet/studio.css";
import "./components/chain/chain.css";


const root = createRoot(document.getElementById("root")!);
installNetworkRestoreGuard();
async function start() {
  try {
    const selected = selectedDingoNetwork();
    if (urlDingoNetwork(window.location.search) !== null)
      persistDingoNetwork(selected.id);
  } catch {
    root.render(<StrictMode><NetworkRecovery /></StrictMode>);
    return;
  }
  const { default: App } = await import("./App.tsx");
  root.render(<StrictMode><App /></StrictMode>);
}
void start().catch(() => {
  root.render(<main className="detail-showcase mx-auto max-w-xl p-8">
    <h1>Could not load the workspace</h1>
    <p role="alert">The application could not load. Reload the page to try again.</p>
    <button className="experience-primary" onClick={() => window.location.reload()}>Reload workspace</button>
  </main>);
});
