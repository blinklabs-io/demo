import { useState } from "react";
import { PageIntro } from "../../components/explorer/Visuals";
import { WalletWelcome } from "../../components/explorer/WalletWelcome";
import { useWalletStore } from "../../stores/walletStore";
import { ToolTransaction } from "../../components/wallet/ToolTransaction";
import { AssetChooser } from "../../components/wallet/AssetChooser";
import { CopyButton } from "../../components/explorer/CopyButton";
export default function WalletSend() {
  const status = useWalletStore((s) => s.status),
    tokens = useWalletStore((s) => s.tokens);
  const [recipient, setRecipient] = useState(""),
    [ada, setAda] = useState(""),
    [selected, setSelected] = useState<Map<string, string>>(new Map());
  if (status !== "connected")
    return <WalletWelcome purpose="send ADA and tokens" />;
  return (
    <div className="wallet-workbench send-page">
      <PageIntro
        eyebrow="From your wallet to theirs"
        title="Move value."
        detail="ADA first. Your assets alongside it."
        symbol="↗"
      />
      <div className="wallet-transfer-layout">
        <div className="wallet-form-card send-bundle-form">
          <label>
            Recipient address
            <input
              aria-label="Recipient address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="addr_test1…"
            />
          </label>
          <section className="send-ada">
            <div className="send-ada-icon" aria-hidden="true">
              ₳
            </div>
            <label>
              ADA amount · required
              <input
                aria-label="ADA amount"
                value={ada}
                inputMode="decimal"
                onChange={(e) => setAda(e.target.value)}
                placeholder="5"
              />
              <small>
                Every transfer includes ADA. Fees are paid separately.
              </small>
            </label>
          </section>
          <AssetChooser
            tokens={tokens}
            selected={selected}
            onChange={setSelected}
          />
          <ToolTransaction
            ready={!!recipient && !!ada}
            action={() => ({
              kind: "send",
              address: recipient,
              ada,
              assets: [...selected].map(([assetId, quantity]) => ({
                assetId,
                quantity,
              })),
            })}
          />
        </div>
        <aside className="transfer-preview">
          <span className="eyebrow">Draft transfer</span>
          <div className="transfer-preview-orbit" aria-hidden="true">
            ↗
          </div>
          <strong>
            {ada || "—"}
            <small>ADA</small>
          </strong>
          <span className="send-bundle-count">
            + {selected.size} additional asset{selected.size === 1 ? "" : "s"}
          </span>
          <span>To</span>
          <div className="tool-identifier">
            <code>{recipient || "Enter a recipient"}</code>
            {recipient && (
              <CopyButton value={recipient} label="recipient address" />
            )}
          </div>
          <div className="transfer-steps">
            <span>01 · Review</span>
            <span>02 · Sign</span>
            <span>03 · On chain</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
