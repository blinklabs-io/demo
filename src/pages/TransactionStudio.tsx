import { DINGO_NETWORK } from "../lib/dingo/config";
import { useDraftGuard } from "../lib/useDraftGuard";
import { WalletConnectSummary } from "../components/layout/WalletConnectSummary";
import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { Link } from "../components/NetworkLink";
import { Panel } from "../components/explorer/Panel";
import { CopyButton } from "../components/explorer/CopyButton";
import { formatAda as ada } from "../lib/format";
import { useWalletStore } from "../stores/walletStore";
import {
  addWalletWitness,
  buildPayment,
  jsonValue,
  readTransaction,
  transactionEnvelope,
  type StudioTransaction,
} from "../lib/transactions/studio";
import "./transaction-studio.css";

export default function TransactionStudio() {
  const location = useLocation();
  const imported =
    typeof location.state?.transactionCbor === "string" &&
    location.state.transactionCbor.length <= 131072
      ? (location.state.transactionCbor as string)
      : "";
  return <StudioWorkspace key={imported} imported={imported} />;
}
function StudioWorkspace({ imported }: { imported: string }) {
  const assertActive = useDraftGuard("transaction-studio");
  const [initial] = useState(() => {
    if (!imported) return { transaction: null, error: "" };
    try { return { transaction: readTransaction(imported), error: "" }; }
    catch (error) { return { transaction: null, error: error instanceof Error ? error.message : "Invalid transaction." }; }
  });
  const wallet = useWalletStore();
  const [mode, setMode] = useState<"build" | "inspect">(
    imported ? "inspect" : "build",
  );
  const [source, setSource] = useState("");
  const [payments, setPayments] = useState([{ address: "", ada: "" }]);
  const [input, setInput] = useState(imported);
  const [transaction, setTransaction] = useState<StudioTransaction | null>(
    initial.transaction,
  );
  const [error, setError] = useState(initial.error);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  function inspect(value: string) {
    return readTransaction(value);
  }
  function invalidate() {
    revision.current++;
    setTransaction(null);
    setError("");
    setNotice("");
  }
  function isCurrent(request?: number) {
    try {
      assertActive();
      return request === undefined || request === revision.current;
    } catch {
      return false;
    }
  }
  async function run(action: () => Promise<StudioTransaction>) {
    const request = revision.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      assertActive();
      const result = await action();
      assertActive();
      if (isCurrent(request)) {
        setTransaction(result);
        setNotice(
          "Transaction ready to review and export. Nothing has been submitted.",
        );
      }
    } catch (e) {
      if (isCurrent(request))
        setError(
          e instanceof Error ? e.message : "Transaction operation failed.",
        );
    } finally {
      // Query navigation can retain this component; settled work must release its lock.
      setBusy(false);
    }
  }
  function download() {
    if (!transaction) return;
    const url = URL.createObjectURL(
      new Blob([transactionEnvelope(transaction)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${transaction.id}.tx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const body = transaction?.tx.body(),
    witnesses = transaction?.tx.witnessSet();
  const plutus = !!(
    witnesses?.plutusV1Scripts()?.size() ||
    witnesses?.plutusV2Scripts()?.size() ||
    witnesses?.plutusV3Scripts()?.size() ||
    witnesses?.redeemers()?.size() ||
    body?.scriptDataHash()
  );
  return (
    <div className="transaction-studio">
      <section className="tx-studio-hero">
        <div>
          <span className="eyebrow">Build with Dingo · Transaction studio</span>
          <h1>Transaction studio</h1>
          <p>
            Turn an address into an unsigned payment. Open a transaction,
            understand its intent, and add your wallet’s witness when you’re
            ready.
          </p>
        </div>
        <div className="tx-pipeline" aria-label="Transaction workflow">
          <span>
            01 <b>Compose</b>
            <small>Dingo UTxOs + parameters</small>
          </span>
          <i>→</i>
          <span>
            02 <b>Inspect</b>
            <small>Decode locally</small>
          </span>
          <i>→</i>
          <span>
            03 <b>Export</b>
            <small>cardano-cli JSON</small>
          </span>
        </div>
      </section>
      <div className="tx-studio-grid">
        <Panel
          title="Your workspace"
          action={
            <div className="tool-segment">
              <button
                disabled={busy}
                aria-pressed={mode === "build"}
                onClick={() => {
                  invalidate();
                  setMode("build");
                }}
              >
                Build
              </button>
              <button
                disabled={busy}
                aria-pressed={mode === "inspect"}
                onClick={() => {
                  invalidate();
                  setMode("inspect");
                }}
              >
                Import & inspect
              </button>
            </div>
          }
        >
          {mode === "build" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => buildPayment(source, payments));
              }}
            >
              <div className="tx-source-label">
                <label htmlFor="funding-address">
                  Funding & change address
                </label>
                {wallet.changeAddress && (
                  <button
                    type="button"
                    className="tool-text-button"
                    disabled={busy}
                    onClick={() => {
                      invalidate();
                      setSource(wallet.changeAddress!);
                    }}
                  >
                    Use connected address
                  </button>
                )}
              </div>
              <input
                id="funding-address"
                className="tx-studio-input"
                placeholder="addr_test1…"
                value={source}
                disabled={busy}
                required
                onChange={(e) => {
                  invalidate();
                  setSource(e.target.value);
                }}
              />
              <p className="tool-help">
                No extension needed. Dingo supplies unspent outputs and current
                fees for this address. Change returns here; datum and
                reference-script outputs stay untouched.
              </p>
              <div className="tx-output-label">
                <h3>Recipients</h3>
                <span>{payments.length} / 20</span>
              </div>
              {payments.map((payment, i) => (
                <div className="tx-recipient" key={i}>
                  <span className="tx-recipient-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <label htmlFor={`recipient-${i}`}>Payment address</label>
                    <input
                      className="tx-studio-input"
                      id={`recipient-${i}`}
                      placeholder="addr_test1…"
                      required
                      disabled={busy}
                      value={payment.address}
                      onChange={(e) => {
                        invalidate();
                        setPayments(
                          payments.map((p, n) =>
                            n === i ? { ...p, address: e.target.value } : p,
                          ),
                        );
                      }}
                    />
                    <label htmlFor={`ada-${i}`}>ADA</label>
                    <input
                      id={`ada-${i}`}
                      className="tx-studio-input"
                      inputMode="decimal"
                      placeholder="10"
                      required
                      disabled={busy}
                      value={payment.ada}
                      onChange={(e) => {
                        invalidate();
                        setPayments(
                          payments.map((p, n) =>
                            n === i ? { ...p, ada: e.target.value } : p,
                          ),
                        );
                      }}
                    />
                  </div>
                  {payments.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove recipient ${i + 1}`}
                      disabled={busy}
                      onClick={() => {
                        invalidate();
                        setPayments(payments.filter((_, n) => n !== i));
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="tx-form-actions">
                <button
                  type="button"
                  disabled={busy || payments.length >= 20}
                  onClick={() => {
                    invalidate();
                    setPayments([...payments, { address: "", ada: "" }]);
                  }}
                >
                  + Recipient
                </button>
                <button
                  className="experience-primary"
                  disabled={
                    busy ||
                    !source ||
                    payments.some((p) => !p.address || !p.ada)
                  }
                >
                  {busy
                    ? "Balancing with Dingo…"
                    : "Build unsigned transaction →"}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <label htmlFor="transaction-file">
                Open a transaction file
              </label>
              <input
                id="transaction-file"
                type="file"
                accept=".json,.tx,.raw,.signed,.cbor,.txt,application/json,text/plain"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  invalidate();
                  const request = revision.current;
                  if (file.size > 135168) {
                    setError("Transaction file exceeds the 64 KiB CBOR limit.");
                    return;
                  }
                  try {
                    const text = await file.text();
                    if (!isCurrent(request)) return;
                    setInput(text);
                    setTransaction(inspect(text));
                  } catch (error) {
                    if (isCurrent(request))
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Could not open file.",
                      );
                  }
                }}
              />
              <div className="tx-output-label">
                <label htmlFor="transaction-cbor">
                  Or paste CBOR hex / JSON
                </label>
              </div>
              <textarea
                id="transaction-cbor"
                className="tx-studio-input tx-cbor-input"
                spellCheck={false}
                placeholder='84a… or { "type": "Tx ConwayEra", … }'
                value={input}
                disabled={busy}
                onPaste={(event) => {
                  event.preventDefault();
                  const field = event.currentTarget;
                  field.setRangeText(event.clipboardData.getData("text"), field.selectionStart, field.selectionEnd, "end");
                  const text = field.value;
                  invalidate();
                  setInput(text);
                  try { setTransaction(inspect(text)); }
                  catch (error) { setError(error instanceof Error ? error.message : "Invalid transaction."); }
                }}
                onChange={(e) => {
                  invalidate();
                  setInput(e.target.value);
                }}
              />
              <p className="tool-help">
                Decoding stays in your browser and works without Dingo. Era
                compatibility is checked automatically; JSON imports retain
                their declared era. Import a complete transaction, including its
                witness set.
              </p>
              <button
                className="experience-primary"
                disabled={busy || !input.trim()}
                onClick={() => {
                  invalidate();
                  try {
                    setTransaction(inspect(input));
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Invalid transaction.",
                    );
                  }
                }}
              >
                Inspect transaction →
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="tool-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="tx-notice">
              {notice}
            </p>
          )}
        </Panel>
        <div className="tx-review-column">
          {transaction && body && witnesses ? (
            <>
              <Panel
                title="Transaction passport"
                action={
                  <span className="tx-status">
                    {transaction.era.replace("Era", "")} export ·{" "}
                    {plutus
                      ? "Plutus"
                      : witnesses.nativeScripts()?.size()
                        ? "Native script"
                        : "Payment"}
                  </span>
                }
              >
                <p className="tool-help">
                  {transaction.eraSource === "compatible"
                    ? "Compatible with Babbage and Conway. Raw CBOR does not identify its original era; export uses Conway for the selected testnet."
                    : transaction.eraSource === "envelope"
                      ? "Export retains the era declared by the imported JSON envelope."
                      : transaction.eraSource === "features"
                        ? `Transaction features match ${transaction.era.replace("Era", "")} among supported eras.`
                        : "Export uses the transaction builder’s era."}
                </p>
                <div className="tx-id">
                  <span>Transaction ID</span>
                  <div>
                    <code>{transaction.id}</code>
                    <CopyButton value={transaction.id} label="transaction ID" />
                  </div>
                </div>
                <div className="tx-metrics">
                  <div>
                    <strong>{ada(body.fee())}</strong>
                    <span>Network fee</span>
                  </div>
                  <div>
                    <strong>{transaction.cbor.length / 2} B</strong>
                    <span>Serialized size</span>
                  </div>
                  <div>
                    <strong>{witnesses.vkeys()?.size() ?? 0}</strong>
                    <span>Key witnesses</span>
                  </div>
                </div>
                <div className="studio-value-flow">
                  <div>
                    <strong>{body.inputs().size()}</strong>
                    <span>spending inputs</span>
                  </div>
                  <b>→</b>
                  <div className="studio-flow-core">
                    DINGO
                    <br />
                    <small>transaction</small>
                  </div>
                  <b>→</b>
                  <div>
                    <strong>{body.outputs().length}</strong>
                    <span>outputs</span>
                  </div>
                </div>
                <p className="tool-help">
                  Decoded, not ledger-validated. Witness count does not prove
                  signing is complete.{" "}
                  {transaction.tx.isValid()
                    ? "Script-valid flag is true; scripts have not been evaluated here."
                    : "Script-valid flag is false: inspect collateral carefully."}
                </p>
                <div className="tx-form-actions">
                  <button className="experience-primary" onClick={download}>
                    ↓ Export cardano-cli JSON
                  </button>
                  <CopyButton
                    value={transaction.cbor}
                    label="transaction CBOR"
                  />
                </div>
              </Panel>
              <Panel title="Add a wallet witness">
                {wallet.status !== "connected" && <WalletConnectSummary />}
                <p className="tool-help">
                  Review the full transaction before approving your wallet.
                  Partial signing supports payment, native-script and Plutus
                  transactions when your wallet can provide the required key.
                  Scripts, redeemers and the original body stay intact.
                </p>
                <button
                  disabled={
                    busy || wallet.status !== "connected" || !wallet.walletApi
                  }
                  onClick={() => {
                    const api = wallet.walletApi!,
                      connection = wallet.connectionId,
                      draftRevision = revision.current;
                    const assert = () => {
                      assertActive();
                      if (revision.current !== draftRevision)
                        throw new Error(
                          "Draft details changed. Review a new transaction.",
                        );
                      const current = useWalletStore.getState();
                      if (
                        current.walletApi !== api ||
                        current.connectionId !== connection ||
                        current.status !== "connected"
                      )
                        throw new Error(
                          "Wallet connection changed. Review and try again.",
                        );
                    };
                    void run(() => addWalletWitness(transaction, api, assert));
                  }}
                >
                  {busy
                    ? "Working…"
                    : wallet.status === "connected"
                      ? "Review in wallet & add witness"
                      : "Connect wallet to add a witness"}
                </button>
                <p className="tool-help">
                  Dingo verifies the {DINGO_NETWORK.label} network and resolves every input
                  before the wallet prompt. This studio exports transactions; it
                  does not submit them.
                </p>
              </Panel>
            </>
          ) : (
            <section className="tx-empty-review">
              <div className="tx-empty-orbit">
                <span>⌁</span>
                <i />
                <i />
              </div>
              <h2>Your transaction, unpacked.</h2>
              <p>
                See outputs, assets, collateral, scripts and signers before
                taking the next step.
              </p>
              <div>
                <span>Address → unsigned</span>
                <span>CBOR → clarity</span>
                <span>Witness → export</span>
              </div>
            </section>
          )}
        </div>
      </div>
      {transaction && body && (
        <>
          <Panel title="Outputs">
            <div className="tx-output-grid">
              {body.outputs().map((output, i) => (
                <article className="tx-output-card" key={i}>
                  <div>
                    <span>OUTPUT {String(i + 1).padStart(2, "0")}</span>
                    <strong>{ada(output.amount().coin())}</strong>
                  </div>
                  <div className="tx-address">
                    <code>
                      {output.address().asByron()
                        ? output.address().toBase58()
                        : output.address().toBech32()}
                    </code>
                    <CopyButton
                      value={
                        output.address().asByron()
                          ? output.address().toBase58()
                          : output.address().toBech32()
                      }
                    />
                  </div>
                  {[...(output.amount().multiasset() ?? [])].map(
                    ([id, amount]) => (
                      <div className="tx-asset" key={id}>
                        <code>{id}</code>
                        <b>{amount.toString()}</b>
                      </div>
                    ),
                  )}
                  {output.datum() && (
                    <details>
                      <summary>Datum</summary>
                      <pre>{output.datum()!.toCbor()}</pre>
                    </details>
                  )}
                  {output.scriptRef() && (
                    <details>
                      <summary>Reference script</summary>
                      <pre>{output.scriptRef()!.toCbor()}</pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </Panel>
          <div className="tx-detail-grid">
            <Panel title="Inputs & spending conditions">
              <pre>
                {jsonValue({
                  inputs: body.inputs().toCore(),
                  collateral: body.collateral()?.toCore(),
                  referenceInputs: body.referenceInputs()?.toCore(),
                  collateralReturn: body.collateralReturn()?.toCore(),
                  totalCollateral: body.totalCollateral(),
                  validityStart: body.validityStartInterval(),
                  validUntil: body.ttl(),
                  requiredSigners: body.requiredSigners()?.toCore(),
                })}
              </pre>
              <p className="tool-help">
                Input values and ownership are not encoded in CBOR. No input
                balance is inferred from these references.
              </p>
            </Panel>
            <Panel title="Metadata, scripts & governance">
              <details open>
                <summary>Full decoded transaction</summary>
                <pre>{jsonValue(transaction.tx.toCore())}</pre>
              </details>
            </Panel>
          </div>
        </>
      )}
      <section className="tx-capability">
        <span className="eyebrow">Build an app on Dingo</span>
        <h2>One node. The pieces your app needs.</h2>
        <p>
          UTxO RPC supplies funds and protocol parameters. Blockfrost supplies
          the current slot. Your browser builds the transaction; your wallet
          adds keys.
        </p>
        <Link to="/api">Explore Dingo’s APIs →</Link>
        <a
          href="https://github.com/blinklabs-io/demo"
          target="_blank"
          rel="noreferrer"
        >
          Use this app’s source ↗
        </a>
      </section>
    </div>
  );
}
