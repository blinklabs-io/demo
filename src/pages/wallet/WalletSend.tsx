import { useId, useRef, useState } from "react";
import { PageIntro } from "../../components/explorer/Visuals";
import { useWalletStore } from "../../stores/walletStore";
import { ToolTransaction } from "../../components/wallet/ToolTransaction";
import { AssetChooser } from "../../components/wallet/AssetChooser";
import { CopyButton } from "../../components/explorer/CopyButton";
export default function WalletSend() {
  const connection = useWalletStore((state) => state.connectionId);
  const address = useWalletStore((state) => state.changeAddress);
  const tokens = useWalletStore((state) => state.tokens);
  const [bundle, setBundle] = useState<{
    owner: string | null;
    selected: Map<string, string>;
  }>({ owner: null, selected: new Map() });
  const available = new Set(tokens.map((token) => token.assetId));
  const selected =
    bundle.owner === address
      ? new Map([...bundle.selected].filter(([id]) => available.has(id)))
      : new Map<string, string>();
  const [recipient, setRecipient] = useState("");
  const [ada, setAda] = useState("");
  return (
    <SendForm
      key={connection}
      recipient={recipient}
      ada={ada}
      onRecipient={setRecipient}
      onAda={setAda}
      selected={selected}
      onAssets={(selected) => setBundle({ owner: address, selected })}
    />
  );
}
function SendForm({
  recipient,
  ada,
  onRecipient,
  onAda,
  selected,
  onAssets,
}: {
  recipient: string;
  ada: string;
  onRecipient: (value: string) => void;
  onAda: (value: string) => void;
  selected: Map<string, string>;
  onAssets: (value: Map<string, string>) => void;
}) {
  const formId = useId();
  const status = useWalletStore((s) => s.status),
    tokens = useWalletStore((s) => s.tokens);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  function edit(update: () => void) {
    generation.current++;
    setRevision(generation.current);
    update();
  }
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
              form={formId}
              aria-label="Recipient address"
              value={recipient}
              onChange={(e) => edit(() => onRecipient(e.target.value))}
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
                form={formId}
                aria-label="ADA amount"
                value={ada}
                inputMode="decimal"
                onChange={(e) => edit(() => onAda(e.target.value))}
                placeholder="5"
              />
              <small>
                Every transfer includes ADA. Fees are paid separately.
              </small>
            </label>
          </section>
          {status === "connected" ? (
            <AssetChooser
              formId={formId}
              tokens={tokens}
              selected={selected}
              onChange={(next) => edit(() => onAssets(next))}
            />
          ) : (
            <section className="additional-assets">
              <h2>Additional assets</h2>
              <p className="metadata-hint">
                Enter a recipient and ADA amount to plan your transfer. Connect
                a wallet to choose from its assets and review the transaction.
              </p>
            </section>
          )}
          <ToolTransaction
            key={revision}
            assertDraft={() => {
              if (generation.current !== revision)
                throw new Error(
                  "Transfer details changed. Review a new transaction.",
                );
            }}
            formId={formId}
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
