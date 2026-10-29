import { UtxoConstellation } from "../../components/chain/UtxoConstellation";
import { useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../stores/walletStore";
import {
  PageIntro,
  Metric,
  Gauge,
  EmptyState,
} from "../../components/explorer/Visuals";
import { CopyButton } from "../../components/explorer/CopyButton";
import { ToolTransaction } from "../../components/wallet/ToolTransaction";
import {
  inputId,
  plainWalletOutputs,
  walletOutputs,
  assetName,
  type Payment,
} from "../../lib/tools/transactions";
import { fileDigest, verifyDocumentProof } from "../../lib/tools/proofs";
import { formatAda } from "../../lib/format";
import { readWalletDRep } from "../../lib/dingo/governanceVote";

const tools = [
  {
    id: "batch",
    icon: "↗",
    name: "Batch payments",
    description: "Many recipients. One transaction.",
    color: "teal",
  },
  {
    id: "utxos",
    icon: "◫",
    name: "UTxO workshop",
    description: "Consolidate your wallet. Split spending outputs.",
    color: "violet",
  },
  {
    id: "proof",
    icon: "⌁",
    name: "Document proofs",
    description: "Hash locally. Timestamp on chain. Verify later.",
    color: "amber",
  },
  {
    id: "mint",
    icon: "✦",
    name: "Token studio",
    description: "Mint and burn native assets with your own policy.",
    color: "teal",
  },
  {
    id: "drep",
    icon: "♧",
    name: "DRep desk",
    description: "Register or renew your governance identity.",
    color: "violet",
  },
  {
    id: "treasury",
    icon: "◎",
    name: "Treasury",
    description: "Donate test ADA directly to the Preview treasury.",
    color: "amber",
  },
];
function AssetOptions() {
  const tokens = useWalletStore((s) => s.tokens);
  return (
    <>
      <option value="lovelace">ADA</option>
      {tokens.map((t) => (
        <option key={t.assetId} value={t.assetId}>
          {assetName(t.assetId)} · {t.quantity.toString()} raw units
        </option>
      ))}
    </>
  );
}
function Batch() {
  const [rows, setRows] = useState<(Payment & { id: number })[]>([
    { id: 0, address: "", amount: "", asset: "lovelace" },
  ]);
  const next = useRef(1);
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const update = (id: number, part: Partial<Payment>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...part } : r)));
  const total = rows
    .filter((r) => r.asset === "lovelace")
    .reduce(
      (n, r) =>
        /^\d+(\.\d{0,6})?$/.test(r.amount)
          ? n +
            BigInt(r.amount.split(".")[0]) * 1000000n +
            BigInt((r.amount.split(".")[1] ?? "").padEnd(6, "0"))
          : n,
      0n,
    );
  function importRows() {
    try {
      const parsed = csv
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [address, amount, asset = "lovelace", ...extra] = line
            .split(",")
            .map((s) => s.trim());
          if (!address || !amount || extra.length)
            throw new Error(
              "Use address,amount,asset per line; asset is optional and defaults to lovelace.",
            );
          return { id: next.current++, address, amount, asset };
        });
      if (!parsed.length || parsed.length > 40)
        throw new Error("Import 1–40 recipients.");
      setRows(parsed);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="tool-metrics">
        <Metric label="Recipients" value={rows.length} />
        <Metric label="ADA in draft" value={formatAda(total)} />
        <Metric label="On-chain transactions" value="1" />
      </div>
      <section className="data-panel tool-form">
        <div className="tool-section-title">
          <h2>Build the payout.</h2>
          <button
            disabled={rows.length >= 40}
            onClick={() =>
              setRows([
                ...rows,
                {
                  id: next.current++,
                  address: "",
                  amount: "",
                  asset: "lovelace",
                },
              ])
            }
          >
            + Recipient
          </button>
        </div>
        <div className="tool-payments">
          {rows.map((r, i) => (
            <article className="tool-payment" key={r.id}>
              <span className="tool-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <label>
                Recipient address
                <input
                  value={r.address}
                  onChange={(e) => update(r.id, { address: e.target.value })}
                  placeholder="addr_test1…"
                  autoComplete="off"
                />
              </label>
              <label>
                Asset
                <select
                  aria-label="Asset"
                  value={r.asset}
                  onChange={(e) =>
                    update(r.id, { asset: e.target.value, amount: "" })
                  }
                >
                  <AssetOptions />
                </select>
              </label>
              <label>
                {r.asset === "lovelace" ? "Amount · ADA" : "Amount · raw units"}
                <input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => update(r.id, { amount: e.target.value })}
                  placeholder="5"
                />
              </label>
              <button
                className="tool-icon-button"
                aria-label={`Remove recipient ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((row) => row.id !== r.id))}
              >
                ×
              </button>
            </article>
          ))}
        </div>
        <details className="tool-import">
          <summary>Import recipients from CSV</summary>
          <label>
            address,amount,asset
            <textarea
              rows={4}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="addr_test1…,5,lovelace"
            />
          </label>
          <button onClick={importRows}>Replace recipients</button>
          {error && (
            <p role="alert" className="tool-error">
              {error}
            </p>
          )}
        </details>
        <p className="tool-help">
          Native asset amounts use raw units. The review includes each token
          output’s required ADA and every change output.
        </p>
        <ToolTransaction
          action={() => ({
            kind: "batch",
            payments: rows.map(({ address, amount, asset }) => ({
              address,
              amount,
              asset,
            })),
          })}
          ready={rows.every((r) => !!r.address && !!r.amount)}
        />
      </section>
    </>
  );
}
function Utxos() {
  const api = useWalletStore((s) => s.walletApi),
    connection = useWalletStore((s) => s.connectionId);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"consolidate" | "split">("consolidate");
  const [count, setCount] = useState("4"),
    [amount, setAmount] = useState("5");
  const query = useQuery({
    queryKey: ["wallet-tools", "utxos", connection],
    enabled: !!api,
    queryFn: () => walletOutputs(api!),
    retry: false,
  });
  const available = useMemo(
    () => plainWalletOutputs(query.data ?? []),
    [query.data],
  );
  const selectedSet = new Set(selected);
  const chosen = available.filter((u) => selectedSet.has(inputId(u)));
  const total = chosen.reduce((n, u) => n + u.output().amount().coin(), 0n);
  return (
    <>
      <div className="tool-metrics">
        <Metric
          label="Spendable wallet outputs"
          value={query.data ? available.length : "—"}
        />
        <Metric label="Selected ADA" value={formatAda(total)} />
        <Metric label="Assets stay in your wallet" value="100%" />
      </div>
      <div className="tool-segment">
        <button
          aria-pressed={mode === "consolidate"}
          onClick={() => setMode("consolidate")}
        >
          Consolidate
        </button>
        <button
          aria-pressed={mode === "split"}
          onClick={() => setMode("split")}
        >
          Split outputs
        </button>
      </div>
      {mode === "consolidate" && (
        <UtxoConstellation
          outputs={available}
          selected={selected}
          onToggle={(id) =>
            setSelected((ids) =>
              ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
            )
          }
        />
      )}
      <div
        className={
          mode === "consolidate" ? "tool-consolidation" : "tool-two-column"
        }
      >
        <section className="data-panel tool-form">
          <h2>
            {mode === "consolidate"
              ? "Fewer outputs. Same assets."
              : "Prepare your next transactions."}
          </h2>
          {mode === "consolidate" ? (
            <>
              <div className="tool-section-title">
                <p>Choose outputs supplied by the connected wallet.</p>
                <button
                  disabled={!available.length}
                  onClick={() =>
                    setSelected(available.slice(0, 100).map(inputId))
                  }
                >
                  Select up to 100
                </button>
              </div>
              {query.isPending && api && (
                <p role="status">Reading wallet outputs…</p>
              )}
              {query.error && (
                <p role="alert" className="tool-error">
                  {query.error.message}
                  <button onClick={() => void query.refetch()}>Retry</button>
                </p>
              )}
              <div className="tool-utxos">
                {available.map((u) => (
                  <label
                    className={`tool-utxo ${selectedSet.has(inputId(u)) ? "selected" : ""}`}
                    key={inputId(u)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(inputId(u))}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, inputId(u)]
                            : s.filter((id) => id !== inputId(u)),
                        )
                      }
                    />
                    <span>
                      <strong>{formatAda(u.output().amount().coin())}</strong>
                      <code>{inputId(u)}</code>
                      <small>
                        {u.output().amount().multiasset()?.size ?? 0} native
                        assets
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {query.data && !available.length && (
                <EmptyState
                  title="No eligible UTxOs"
                  detail="Connect a funded wallet. Outputs with datums or reference scripts are kept out of consolidation."
                  icon="◫"
                />
              )}
              <p className="tool-help">
                Only UTxOs exposed by your wallet are spendable here. Addresses
                sharing your stake key do not establish control of their payment
                keys. Datum and reference-script outputs are excluded.
              </p>
            </>
          ) : (
            <>
              <label>
                Number of equal ADA outputs
                <input
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
              <label>
                ADA per output
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <p className="tool-help">
                Creates 2–40 equal ADA outputs at your wallet’s change address,
                plus remaining ADA and native assets as change.
              </p>
            </>
          )}
          <ToolTransaction
            key={mode}
            ready={mode === "split" || chosen.length >= 2}
            action={() =>
              mode === "consolidate"
                ? { kind: "consolidate", inputs: chosen.map(inputId) }
                : { kind: "split", count, amount }
            }
          />
        </section>
        {mode === "split" && (
          <aside className="tool-visual data-panel">
            <div className={`utxo-map ${mode}`} aria-hidden="true">
              <div className="utxo-nodes">
                {Array.from(
                  {
                    length: 1,
                  },
                  (_, i) => (
                    <i key={i} />
                  ),
                )}
              </div>
              <b>→</b>
              <div className="utxo-nodes">
                {Array.from(
                  {
                    length: Math.min(Math.max(Number(count) || 4, 2), 12),
                  },
                  (_, i) => (
                    <i key={i} />
                  ),
                )}
              </div>
            </div>
            <h3>Give your wallet room to move.</h3>
            <p>
              Separate outputs can fund independent transactions. Each one must
              meet Cardano’s minimum ADA requirement.
            </p>
            <Gauge
              label="Output count"
              value={Math.min(((Number(count) || 0) / 40) * 100, 100)}
              detail={`${count} outputs`}
            />
          </aside>
        )}
      </div>
    </>
  );
}
function Proof() {
  const [file, setFile] = useState<File | null>(null),
    [digest, setDigest] = useState(""),
    [message, setMessage] = useState(""),
    [hash, setHash] = useState("");
  const generation = useRef(0);
  const hashing = useMutation({
    mutationFn: async (next: File) => {
      const id = ++generation.current;
      const digest = await fileDigest(next);
      if (id === generation.current) {
        setFile(next);
        setDigest(digest);
      }
    },
  });
  const verify = useMutation({
    mutationFn: () => verifyDocumentProof(hash.trim(), digest),
  });
  return (
    <div className="tool-two-column">
      <section className="data-panel tool-form">
        <h2>A fingerprint. A permanent timestamp.</h2>
        <label className="tool-drop">
          <span className="tool-file-symbol" aria-hidden="true">
            ⌁
          </span>
          <strong>{file?.name ?? "Choose a document"}</strong>
          <span>The file stays on your device · up to 32 MiB</span>
          <input
            type="file"
            aria-label="Document to hash"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setDigest("");
              setFile(null);
              verify.reset();
              if (f) hashing.mutate(f);
              else generation.current++;
            }}
          />
        </label>
        {hashing.isPending && <p role="status">Computing SHA-256 locally…</p>}
        {hashing.error && (
          <p role="alert" className="tool-error">
            {hashing.error.message}
          </p>
        )}
        {digest && (
          <div className="tool-digest">
            <span className="eyebrow">SHA-256</span>
            <div className="tool-identifier">
              <code>{digest}</code>
              <CopyButton value={digest} label="file digest" />
            </div>
          </div>
        )}
        <label>
          Public message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What does this proof record?"
          />
        </label>
        <p className="tool-help">
          The file name, hash, and message become public metadata. This proves
          that the fingerprint existed by its block’s timestamp; it does not
          prove authorship or ownership.
        </p>
        <ToolTransaction
          ready={!!digest}
          action={() => ({
            kind: "proof",
            name: file?.name ?? "",
            digest,
            message,
          })}
        />
      </section>
      <aside className="data-panel tool-form">
        <div className="tool-proof-seal" aria-hidden="true">
          ✓
        </div>
        <h2>Verify a proof.</h2>
        <p>
          Choose the original file on the left and paste the transaction that
          published its fingerprint.
        </p>
        <label>
          Proof transaction hash
          <input
            value={hash}
            onChange={(e) => {
              setHash(e.target.value);
              verify.reset();
            }}
            placeholder="64-character transaction hash"
          />
        </label>
        <button
          className="tool-primary"
          disabled={!digest || !hash || verify.isPending}
          onClick={() => verify.mutate()}
        >
          {verify.isPending ? "Checking Dingo…" : "Verify against Dingo"}
        </button>
        {verify.error && (
          <p role="alert" className="tool-error">
            {verify.error.message}
          </p>
        )}
        {verify.data && (
          <div className="tool-success" role="status">
            <strong>Matching proof confirmed</strong>
            <p>{new Date(verify.data.time * 1000).toLocaleString()}</p>
            <Link to={`/explorer/tx/${verify.data.hash}`}>
              Inspect transaction →
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
function Mint() {
  const tokens = useWalletStore((s) => s.tokens);
  const [mode, setMode] = useState<"mint" | "burn">("mint");
  const [name, setName] = useState(""),
    [quantity, setQuantity] = useState("1000"),
    [minutes, setMinutes] = useState("1440"),
    [description, setDescription] = useState(""),
    [asset, setAsset] = useState(""),
    [policy, setPolicy] = useState(""),
    [importError, setImportError] = useState("");
  const bytes = new TextEncoder().encode(name).length;
  async function importPolicy(file: File) {
    try {
      if (file.size > 16384) throw new Error("Policy file is too large.");
      const data = JSON.parse(await file.text());
      if (data.networkMagic !== 2 || typeof data.nativeScriptCbor !== "string")
        throw new Error("Choose a Preview policy file exported by this tool.");
      setPolicy(data.nativeScriptCbor);
      setImportError("");
    } catch (e) {
      setImportError((e as Error).message);
    }
  }
  return (
    <>
      <div className="tool-segment">
        <button aria-pressed={mode === "mint"} onClick={() => setMode("mint")}>
          Mint tokens
        </button>
        <button aria-pressed={mode === "burn"} onClick={() => setMode("burn")}>
          Burn tokens
        </button>
      </div>
      <div className="tool-two-column">
        <section className="data-panel tool-form">
          <h2>
            {mode === "mint"
              ? "Make something on chain."
              : "Retire your tokens."}
          </h2>
          {mode === "mint" ? (
            <>
              <label>
                Asset name
                <input
                  aria-label="Asset name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="DINGO"
                />
                <small>{bytes} / 32 UTF-8 bytes</small>
              </label>
              <label>
                Public description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                Policy lifetime · minutes
                <input
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Asset
                <select
                  aria-label="Asset"
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  <option value="">Select a wallet asset</option>
                  {tokens.map((t) => (
                    <option value={t.assetId} key={t.assetId}>
                      {assetName(t.assetId)} · {t.quantity.toString()} units
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Saved policy file
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      void importPolicy(e.target.files[0]);
                  }}
                />
              </label>
              <label>
                Native policy CBOR
                <textarea
                  rows={3}
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                  placeholder="Or paste the native script CBOR"
                />
              </label>
              {importError && (
                <p className="tool-error" role="alert">
                  {importError}
                </p>
              )}
            </>
          )}
          <label>
            Quantity · raw units
            <input
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <ToolTransaction
            key={mode}
            ready={mode === "mint" ? !!name : !!asset && !!policy}
            action={() =>
              mode === "mint"
                ? { kind: "mint", name, quantity, minutes, description }
                : { kind: "burn", asset, quantity, policy }
            }
          />
        </section>
        <aside className="tool-token-preview data-panel">
          <div className="tool-token" aria-hidden="true">
            <span>
              {mode === "burn" ? "−" : name.slice(0, 2).toUpperCase() || "✦"}
            </span>
          </div>
          <span className="eyebrow">Native Cardano asset · Preview</span>
          <h3>
            {mode === "burn"
              ? assetName(asset) || "Select an asset"
              : name || "Your next token"}
          </h3>
          <strong>
            {quantity || "0"}
            <small>raw units {mode === "burn" ? "to burn" : "to mint"}</small>
          </strong>
          <p>
            A native signature-and-expiry policy needs no deployed contract.
            Download your policy at review. After it expires, neither minting
            nor burning is possible under that policy.
          </p>
          <p>
            Supply is not unique or capped by this policy. Tokens are sent to
            your wallet; no external marketplace or minting service is used.
          </p>
        </aside>
      </div>
    </>
  );
}
function Drep() {
  const api = useWalletStore((s) => s.walletApi),
    connection = useWalletStore((s) => s.connectionId);
  const [operation, setOperation] = useState<"register" | "renew">("register");
  const role = useQuery({
    queryKey: ["wallet-tools", "drep", connection],
    enabled: !!api?.cip95,
    queryFn: () => readWalletDRep(api!),
    retry: false,
  });
  return (
    <div className="tool-two-column">
      <section className="data-panel tool-form">
        <h2>Participate in governance.</h2>
        <p>
          Register your wallet’s CIP-95 DRep key on Preview. A registered DRep
          can vote on governance actions in the explorer.
        </p>
        <label>
          Action
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
          >
            <option value="register">Register DRep</option>
            <option value="renew">
              Renew activity and clear metadata anchor
            </option>
          </select>
        </label>
        {operation === "renew" && (
          <p className="tool-help">
            This submits an update without a metadata anchor. Any existing DRep
            metadata link will be cleared.
          </p>
        )}
        <ToolTransaction action={() => ({ kind: "drep", operation })} />
      </section>
      <aside className="data-panel tool-form tool-drep-preview">
        <span aria-hidden="true">♧</span>
        <h3>
          {role.data && !role.data.retired
            ? "Registered DRep"
            : "Your governance identity"}
        </h3>
        {!api?.cip95 && (
          <p>
            Connect a wallet supporting CIP-95 to access its DRep signing key.
          </p>
        )}
        {role.isPending && api?.cip95 && <p>Reading DRep registration…</p>}
        {role.error && (
          <p role="alert" className="tool-error">
            {role.error.message}
            <button onClick={() => void role.refetch()}>Retry</button>
          </p>
        )}
        {role.data && (
          <>
            <code>{role.data.drep_id}</code>
            <p>
              {role.data.retired
                ? "Retired"
                : role.data.expired
                  ? "Activity expired"
                  : "Registered"}
            </p>
          </>
        )}
        <p>
          Registration deposits are read from Dingo’s current protocol
          parameters and shown before signing.
        </p>
        <Link to="/explorer/governance">Explore governance actions →</Link>
      </aside>
    </div>
  );
}
function Treasury() {
  const [amount, setAmount] = useState("10");
  return (
    <div className="tool-two-column">
      <section className="data-panel tool-form">
        <h2>Fund Preview’s treasury.</h2>
        <label>
          Donation · ADA
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <p>
          The donation is recorded in the transaction’s treasury field. It goes
          directly to the Preview treasury, with no intermediary address or
          contract.
        </p>
        <ToolTransaction action={() => ({ kind: "donate", amount })} />
      </section>
      <aside className="tool-treasury data-panel">
        <div aria-hidden="true">◎</div>
        <strong>
          {amount || "—"}
          <small>test ADA</small>
        </strong>
        <p>Preview treasury donation</p>
        <span className="tool-route-pill">Your wallet → Cardano treasury</span>
      </aside>
    </div>
  );
}
function ToolBody({ tool }: { tool: string }) {
  switch (tool) {
    case "batch":
      return <Batch />;
    case "utxos":
      return <Utxos />;
    case "proof":
      return <Proof />;
    case "mint":
      return <Mint />;
    case "drep":
      return <Drep />;
    case "treasury":
      return <Treasury />;
    default:
      return null;
  }
}
export default function WalletTools() {
  const { tool } = useParams();
  const connection = useWalletStore((s) => s.connectionId);
  const current = tools.find((t) => t.id === tool);
  return (
    <div className="wallet-tools">
      <PageIntro
        eyebrow="Built on Cardano. Powered by Dingo."
        title={current?.name ?? "More than a wallet."}
        detail={
          current?.description ??
          "Create, organize, prove, and participate. Every on-chain action goes through Dingo."
        }
        symbol={current?.icon ?? "✦"}
      />
      {!tool ? (
        <>
          <div className="tool-catalog">
            {tools.map((t, i) => (
              <Link
                className={`tool-catalog-card tool-${t.color}`}
                key={t.id}
                to={`/wallet/tools/${t.id}`}
              >
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")} · Preview
                </span>
                <span className="tool-catalog-icon" aria-hidden="true">
                  {t.icon}
                </span>
                <h2>{t.name}</h2>
                <p>{t.description}</p>
                <span className="tool-catalog-go">
                  Open tool <b aria-hidden="true">↗</b>
                </span>
              </Link>
            ))}
          </div>
          <div className="tool-api-strip">
            <span>Wallet signing</span>
            <b>+</b>
            <span>Dingo APIs</span>
            <b>=</b>
            <span>Cardano, directly.</span>
          </div>
        </>
      ) : current ? (
        <>
          <nav className="tool-tabs" aria-label="Wallet tools">
            <NavLink end to="/wallet/tools">
              All tools
            </NavLink>
            {tools.map((t) => (
              <NavLink key={t.id} to={`/wallet/tools/${t.id}`}>
                {t.name}
              </NavLink>
            ))}
          </nav>
          <ToolBody key={`${tool}:${connection}`} tool={tool} />
        </>
      ) : (
        <EmptyState
          icon="⌕"
          title="Tool not found"
          detail="Choose one of the available wallet tools."
          action={<Link to="/wallet/tools">All tools</Link>}
        />
      )}
    </div>
  );
}
