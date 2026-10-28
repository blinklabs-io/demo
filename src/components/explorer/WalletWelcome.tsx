import { EmptyState, Timeline } from "./Visuals";
import { WalletConnectSummary } from "../layout/WalletConnectSummary";

export function WalletWelcome({ purpose }: { purpose: string }) {
  return (
    <section className="data-panel wallet-welcome">
      <EmptyState
        icon="▣"
        title="Your wallet. Your keys."
        detail={`Connect a browser wallet to ${purpose}. Transactions are reviewed and signed in your wallet.`}
        action={<WalletConnectSummary />}
      />
      <div className="welcome-steps">
        <Timeline
          items={[
            {
              label: "Connect",
              detail: "Choose an installed browser wallet.",
              complete: false,
            },
            {
              label: "Build",
              detail: "Prepare a transfer, swap, or delegation.",
              complete: false,
            },
            {
              label: "Review & sign",
              detail: "Your wallet asks you to approve every transaction.",
              complete: false,
            },
          ]}
        />
      </div>
    </section>
  );
}
