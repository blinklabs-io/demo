import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageIntro } from "../../components/explorer/Visuals";
import { TransactionTracker } from "../../components/explorer/TransactionTracker";
import { networkTo } from "../../lib/dingo/networkLinks";
import { isTransactionHash } from "../../lib/explorer/transactionTracking";
import { BuildThis } from "../../components/developer/BuildThis";

export default function TransactionTracking() {
  const { hash = "" } = useParams();
  return <TrackingBody key={hash} hash={hash} />;
}

function TrackingBody({ hash }: { hash: string }) {
  const [input, setInput] = useState(hash);
  const navigate = useNavigate();
  return (
    <div className="developer-page">
      <PageIntro
        eyebrow="Live chain evidence"
        title="Transaction tracker"
        detail="Follow submission, mempool presence, inclusion, and confirmation depth."
        symbol="↗"
      />
      <form
        className="developer-panel developer-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (isTransactionHash(input.trim()))
            void navigate(
              networkTo(`/explorer/track/${input.trim().toLowerCase()}`),
            );
        }}
      >
        <label>
          Transaction ID
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="64-character transaction hash"
            maxLength={64}
            required
            pattern="[0-9a-fA-F]{64}"
          />
        </label>
        <button className="experience-primary" type="submit">
          Track transaction →
        </button>
      </form>
      {hash && <TransactionTracker key={hash} hash={hash} />}
      <BuildThis recipe="tracker" />
    </div>
  );
}
