import { useMemo, useState } from "react";
import { Link } from "../NetworkLink";
import { Core } from "@blaze-cardano/sdk";
import { Panel } from "./Panel";
import { CopyButton } from "./CopyButton";
import { HashLink } from "./HashLink";
import { AssetIcon } from "../wallet/AssetChooser";
import { formatAda } from "../../lib/format";
import { assetName } from "../../lib/tools/transactions";
import { fraction } from "../../lib/chain/geometry";
import {
  readableName,
  transactionJson,
  transactionKind,
  type LedgerUtxo,
  type TransactionInspection,
  type TransactionRecord,
} from "../../lib/explorer/transaction";
import "./transaction-insights.css";

function RawValue({
  value,
  label = "Decoded data",
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="ti-raw">
      <summary>{label}</summary>
      <pre>{transactionJson(value)}</pre>
    </details>
  );
}
function Identifier({
  value,
  label = "identifier",
}: {
  value: string;
  label?: string;
}) {
  return (
    <div className="ti-identifier">
      <code>{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
function AddressKind({ address }: { address: string }) {
  let label = "Address";
  try {
    const a = Core.Address.fromString(address);
    label = !a
      ? "Address"
      : a.asByron()
      ? "Byron"
      : a?.getProps().paymentPart?.type === Core.CredentialType.ScriptHash
        ? "Script"
        : "Payment key";
  } catch {
    /* The original address remains available if its encoding is unknown. */
  }
  return (
    <span className={`ti-address-kind ${label === "Script" ? "script" : ""}`}>
      {label === "Script" ? "⌘" : "◈"} {label}
    </span>
  );
}
export function TransactionPassport({
  record,
  inspection,
}: {
  record: TransactionRecord;
  inspection?: TransactionInspection;
}) {
  const count = inspection?.body.outputs().length;
  const start =
      record.invalid_before == null ? null : BigInt(record.invalid_before),
    end =
      record.invalid_hereafter == null
        ? null
        : BigInt(record.invalid_hereafter),
    included = BigInt(record.slot);
  const position =
    start !== null && end !== null && end > start
      ? Math.max(
          0,
          Math.min(100, fraction(included - start, end - start) * 100),
        )
      : 50;
  return (
    <section className="ti-passport">
      <div className="ti-passport-top">
        <span className="eyebrow">
          {inspection ? transactionKind(inspection) : "On-chain transaction"}
        </span>
        <span className={`ti-verdict ${record.valid_contract ? "" : "failed"}`}>
          {record.valid_contract
            ? "✓ Confirmed"
            : "! Script failure · collateral applied"}
        </span>
      </div>
      <div className="ti-passport-heading">
        <div>
          <h1>
            {record.valid_contract
              ? "Value in motion."
              : "A different outcome."}
          </h1>
          <p>
            {record.valid_contract
              ? "One atomic change to the ledger. Follow its inputs, outputs and intent."
              : "Normal spending, outputs and actions were not applied. Inspect the collateral effect separately."}
          </p>
        </div>
        <span className="ti-passport-emblem" aria-hidden="true">
          {record.valid_contract ? "⇄" : "!"}
        </span>
      </div>
      <Identifier value={record.hash} label="transaction ID" />
      <div className="ti-passport-metrics">
        <div>
          <strong>{formatAda(BigInt(record.fees))}</strong>
          <span>
            {record.valid_contract
              ? "Transaction fee"
              : "Declared fee · not the collateral charge"}
          </span>
        </div>
        <div>
          <strong>{record.size.toLocaleString()} B</strong>
          <span>Serialized transaction</span>
        </div>
        <div>
          <strong>
            {inspection?.body.inputs().size() ?? "—"}
            <small> → {count ?? "—"}</small>
          </strong>
          <span>Spending inputs → planned outputs</span>
        </div>
        <div>
          <strong>{inspection?.redeemers.length ?? "—"}</strong>
          <span>Script redeemers</span>
        </div>
      </div>
      <div className="ti-inclusion">
        <Link to={`/explorer/block/${record.block}`}>
          ⬡ Block #{record.block_height.toLocaleString()} · position{" "}
          {record.index}
        </Link>
        <time dateTime={new Date(record.block_time * 1000).toISOString()}>
          {new Date(record.block_time * 1000).toLocaleString()}
        </time>
      </div>
      <div className="ti-validity" aria-label="Transaction validity window">
        <div className="ti-validity-track">
          <i style={{ left: `${position}%` }} />
          <span style={{ left: `${Math.max(18, Math.min(82, position))}%` }}>
            Included · slot {record.slot.toLocaleString()}
          </span>
        </div>
        <div>
          <span>
            {start === null
              ? "No lower validity bound"
              : `Valid from slot ${start.toLocaleString()}`}
          </span>
          <span>
            {end === null
              ? "No expiry set"
              : `Expires at slot ${end.toLocaleString()} (exclusive)`}
          </span>
        </div>
      </div>
    </section>
  );
}
export function TransactionOutputs({
  inputs,
  outputs,
  valid,
  transactionHash,
}: {
  transactionHash: string;
  inputs: LedgerUtxo[];
  outputs: LedgerUtxo[];
  valid: boolean;
}) {
  const [scope, setScope] = useState("outputs"),
    [page, setPage] = useState(1);
  const groups = [
    { key: "outputs", label: "Outputs", rows: outputs },
    {
      key: "spending",
      label: "Spending inputs",
      rows: inputs.filter((r) => !r.collateral && !r.reference),
    },
    {
      key: "reference",
      label: "Reference inputs",
      rows: inputs.filter((r) => r.reference),
    },
    {
      key: "collateral",
      label: "Collateral inputs",
      rows: inputs.filter((r) => r.collateral && !r.reference),
    },
  ];
  const selected = groups.find((g) => g.key === scope)!;
  const pages = Math.max(1, Math.ceil(selected.rows.length / 6)),
    current = Math.min(page, pages);
  return (
    <Panel title="Inspect the ledger edges">
      <div
        className="ti-tabs"
        role="group"
        aria-label="Transaction input and output category"
      >
        {groups.map((g) => (
          <button
            key={g.key}
            aria-pressed={scope === g.key}
            onClick={() => {
              setScope(g.key);
              setPage(1);
            }}
          >
            {g.label}
            <b>{g.rows.length}</b>
          </button>
        ))}
      </div>
      <div className="ti-io-grid">
        {selected.rows
          .slice((current - 1) * 6, current * 6)
          .map((row, index) => {
            const native = row.amount.filter((a) => a.unit !== "lovelace"),
              coin = row.amount.find((a) => a.unit === "lovelace");
            const applied =
              scope === "reference"
                ? "Read only"
                : row.collateral
                  ? valid
                    ? "Not applied"
                    : scope === "outputs"
                      ? "Collateral returned"
                      : "Collateral consumed"
                  : valid
                    ? scope === "outputs"
                      ? "Output created"
                      : "Input consumed"
                    : "Not applied";
            return (
              <article
                className={`ti-io-card ${row.collateral ? "collateral" : ""}`}
                key={`${scope === "outputs" ? transactionHash : row.tx_hash}:${row.output_index}:${index}`}
              >
                <header>
                  <span>
                    {scope === "outputs" ? "OUTPUT" : "INPUT"} #
                    {row.output_index}
                  </span>
                  <AddressKind address={row.address} />
                </header>
                <strong className="ti-io-value">
                  {coin ? formatAda(BigInt(coin.quantity)) : "0.00 ADA"}
                </strong>
                <div className="ti-edge-status">
                  <span>{applied}</span>
                  {scope === "outputs" &&
                    (valid ? !row.collateral : row.collateral) &&
                    row.consumed_by_tx && (
                    <Link to={`/explorer/tx/${row.consumed_by_tx}`}>
                      Spent later ↗
                    </Link>
                  )}
                </div>
                <HashLink kind="address" id={row.address} full />
                <div className="ti-assets-inline">
                  {native.slice(0, 3).map((a) => (
                    <Link
                      key={a.unit}
                      to={`/explorer/asset/${a.unit}`}
                      title={a.unit}
                    >
                      {assetName(a.unit)}{" "}
                      <b>{BigInt(a.quantity).toLocaleString()}</b>
                    </Link>
                  ))}
                </div>
                {native.length > 3 && (
                  <RawValue
                    value={native}
                    label={`All ${native.length} native asset amounts (raw units)`}
                  />
                )}
                <footer>
                  <Link
                    to={`/explorer/tx/${scope === "outputs" ? transactionHash : row.tx_hash}`}
                  >
                    Transaction ↗
                  </Link>
                  <span>
                    {native.length} native asset{native.length === 1 ? "" : "s"}
                  </span>
                </footer>
                {(row.data_hash ||
                  row.inline_datum ||
                  row.reference_script_hash) && (
                  <details className="ti-output-data">
                    <summary>
                      {[
                        row.inline_datum
                          ? "Inline datum"
                          : row.data_hash
                            ? "Datum hash"
                            : null,
                        row.reference_script_hash ? "Reference script" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </summary>
                    {row.data_hash && (
                      <Identifier value={row.data_hash} label="datum hash" />
                    )}
                    {row.inline_datum && <DatumView cbor={row.inline_datum} />}{" "}
                    {row.reference_script_hash && (
                      <Identifier
                        value={row.reference_script_hash}
                        label="reference script hash"
                      />
                    )}
                  </details>
                )}
              </article>
            );
          })}
      </div>
      {!selected.rows.length && (
        <p className="ti-note">
          No {selected.label.toLowerCase()} in Dingo’s record.
        </p>
      )}
      {pages > 1 && (
        <div className="ti-pagination">
          <button disabled={current === 1} onClick={() => setPage(current - 1)}>
            ← Previous
          </button>
          <span>
            {selected.rows.length} records · {current} / {pages}
          </span>
          <button
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next →
          </button>
        </div>
      )}
      <p className="ti-note">
        Reference inputs are read, not spent. Native assets use raw integer
        units. Input and output amounts come from Dingo; they are not inferred
        from CBOR references.
      </p>
    </Panel>
  );
}
function DatumView({ cbor }: { cbor: string }) {
  const decoded = useMemo(() => {
    try {
      return transactionJson(
        Core.PlutusData.fromCbor(Core.HexBlob(cbor)).toCore(),
      );
    } catch {
      return null;
    }
  }, [cbor]);
  return (
    <div>
      <Identifier value={cbor} label="datum CBOR" />
      <Link to="/wallet/tools/data" state={{ plutusCbor: cbor }}>Open datum workbench →</Link>
      {decoded && <pre className="ti-datum">{decoded}</pre>}
    </div>
  );
}
function AssetActivity({
  inspection,
  inputs,
  valid,
}: {
  inspection: TransactionInspection;
  inputs: LedgerUtxo[];
  valid: boolean;
}) {
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const assets = new Map<
      string,
      { id: string; input: bigint; output: bigint; mint: bigint }
    >();
    const row = (id: string) => {
      if (!assets.has(id))
        assets.set(id, { id, input: 0n, output: 0n, mint: 0n });
      return assets.get(id)!;
    };
    for (const u of inputs.filter((u) => !u.reference && !u.collateral))
      for (const a of u.amount)
        if (a.unit !== "lovelace") row(a.unit).input += BigInt(a.quantity);
    for (const output of inspection.body.outputs())
      for (const [id, n] of output.amount().multiasset() ?? [])
        row(id).output += n;
    for (const [id, n] of inspection.body.mint() ?? []) row(id).mint = n;
    return [...assets.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [inspection, inputs]);
  if (!rows.length) return null;
  const inputValuesKnown =
    inputs.filter((u) => !u.reference && !u.collateral).length ===
    inspection.body.inputs().size();
  const pages = Math.ceil(rows.length / 6),
    current = Math.min(page, pages);
  return (
    <Panel
      title={
        <span>
          {valid ? "Assets in motion" : "Declared assets · not applied"}{" "}
          <small className="ti-count">{rows.length}</small>
        </span>
      }
    >
      <div className="ti-asset-grid">
        {rows.slice((current - 1) * 6, current * 6).map((r) => {
          const max = r.input > r.output ? r.input : r.output;
          return (
            <article className="ti-asset-card" key={r.id}>
              <header>
                <AssetIcon assetId={r.id} />
                <div>
                  <Link to={`/explorer/asset/${r.id}`}>
                    {assetName(r.id) || "Unnamed asset"}
                  </Link>
                  <span>
                    {r.mint > 0n ? "Mint" : r.mint < 0n ? "Burn" : "Transfer"}
                    {valid ? "" : " · not applied"}
                  </span>
                </div>
              </header>
              <div className="ti-asset-bars">
                <div>
                  <span>Spending inputs</span>
                  <b>
                    {inputValuesKnown ? r.input.toLocaleString() : "Unresolved"}
                  </b>
                  <i
                    style={{
                      width: `${inputValuesKnown ? fraction(r.input, max) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div>
                  <span>Planned outputs</span>
                  <b>{r.output.toLocaleString()}</b>
                  <i style={{ width: `${fraction(r.output, max) * 100}%` }} />
                </div>
              </div>
              {r.mint !== 0n && (
                <strong className={r.mint > 0n ? "ti-mint" : "ti-burn"}>
                  {r.mint > 0n ? "+" : ""}
                  {r.mint.toLocaleString()} raw units
                </strong>
              )}
              <Identifier value={r.id} label="asset ID" />
            </article>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="ti-pagination">
          <button disabled={current === 1} onClick={() => setPage(current - 1)}>
            ← Previous
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next →
          </button>
        </div>
      )}
      <p className="ti-note">
        Mint and burn quantities are declared in the transaction body. Reference
        and collateral inputs are excluded.{" "}
        {valid
          ? ""
          : "These normal asset movements were not applied because script validation failed."}
      </p>
    </Panel>
  );
}
function Execution({
  inspection,
  inputs,
}: {
  inspection: TransactionInspection;
  inputs: LedgerUtxo[];
}) {
  const { scripts, redeemers, witness } = inspection;
  const mem = redeemers.reduce((n, r) => n + r.memory, 0n),
    steps = redeemers.reduce((n, r) => n + r.steps, 0n);
  const references = [
    ...new Set(
      inputs
        .filter(
          (r) => (r.reference || !r.collateral) && r.reference_script_hash,
        )
        .map((r) => r.reference_script_hash!),
    ),
  ];
  if (
    !scripts.length &&
    !redeemers.length &&
    !references.length &&
    !witness.plutusData()?.size()
  )
    return null;
  return (
    <Panel title="Inside the execution engine">
      <div className="ti-execution-summary">
        <div>
          <span>⌘</span>
          <strong>{redeemers.length}</strong>
          <small>Redeemers</small>
        </div>
        <div>
          <span>◫</span>
          <strong>{mem.toLocaleString()}</strong>
          <small>Declared memory units</small>
        </div>
        <div>
          <span>↻</span>
          <strong>{steps.toLocaleString()}</strong>
          <small>Declared execution steps</small>
        </div>
        <div>
          <span>◇</span>
          <strong>
            {scripts.length} + {references.length}
          </strong>
          <small>Witness + reference scripts</small>
        </div>
      </div>
      <p className="ti-note">
        These are declared execution budgets, not measured CPU usage. Bar
        lengths compare budgets inside this transaction.
      </p>
      <div className="ti-redeemers">
        {redeemers.map((r, i) => (
          <article key={i}>
            <header>
              <span className="ti-purpose">{r.purpose}</span>
              <strong>#{r.index.toString()}</strong>
            </header>
            <div className="ti-budget">
              <span>Memory</span>
              <b>{r.memory.toLocaleString()}</b>
              <i style={{ width: `${fraction(r.memory, mem) * 100}%` }} />
            </div>
            <div className="ti-budget cpu">
              <span>Steps</span>
              <b>{r.steps.toLocaleString()}</b>
              <i style={{ width: `${fraction(r.steps, steps) * 100}%` }} />
            </div>
            <RawValue value={r.data} label="Redeemer data" />
            <Identifier value={r.cbor} label="redeemer data CBOR" />
            <Link to="/wallet/tools/data" state={{ plutusCbor: r.cbor }}>Open redeemer workbench →</Link>
          </article>
        ))}
      </div>
      <div className="ti-script-grid">
        {scripts.map((s, i) => (
          <article key={`${s.hash}:${i}`}>
            <header>
              <span>⌘ {s.language}</span>
              <b>{s.cbor.length / 2} B</b>
            </header>
            <Identifier value={s.hash} label="script hash" />
            {s.data !== null ? (
              <RawValue value={s.data} label="Native signing conditions" />
            ) : (
              <details className="ti-raw">
                <summary>Script CBOR</summary>
                <Identifier value={s.cbor} label="script CBOR" />
              </details>
            )}
          </article>
        ))}
        {references.map((hash) => (
          <article key={hash}>
            <header>
              <span>↗ Reference script</span>
            </header>
            <Identifier value={hash} label="script hash" />
            <p className="ti-note">
              Available from an input; not carried in the witness set.
            </p>
          </article>
        ))}
      </div>
      {!!witness.plutusData()?.size() && (
        <RawValue
          value={witness.plutusData()!.toCore()}
          label={`${witness.plutusData()!.size()} witness datum values`}
        />
      )}
    </Panel>
  );
}
function Signing({ inspection }: { inspection: TransactionInspection }) {
  const declared = inspection.body.requiredSigners()?.toCore() ?? [],
    valid = inspection.signatures.filter((s) => s.valid).length;
  return (
    <Panel title="Who authorized it?">
      <div className="ti-signing-summary">
        <div className="ti-key-orbit">
          <span>⌘</span>
          <strong>{inspection.signatures.length}</strong>
          <small>key witnesses</small>
        </div>
        <div>
          <h3>{valid} signatures verified</h3>
          <p className="ti-note">
            Ed25519 signatures checked against this transaction’s body hash.
            Explicit required signers are only one part of the ledger’s
            authorization rules.
          </p>
          <div className="ti-signing-tags">
            <span>{declared.length} explicit required signers</span>
            <span>
              {inspection.witness.bootstraps()?.size() ?? 0} bootstrap witnesses
            </span>
          </div>
        </div>
      </div>
      <div className="ti-signer-list">
        {inspection.signatures.map((s) => (
          <details key={s.key}>
            <summary>
              <span className={`ti-signature-state ${s.valid ? "valid" : ""}`}>
                {s.valid ? "✓ Valid" : "! Invalid"}
              </span>
              <code>{s.hash}</code>
              <span>
                {declared.includes(s.hash)
                  ? "Explicitly required"
                  : "Key witness"}
              </span>
            </summary>
            <Identifier value={s.key} label="public key" />
            <Identifier value={s.signature} label="signature" />
          </details>
        ))}
      </div>
      {declared.length > 0 && (
        <details className="ti-raw">
          <summary>Explicit required signer hashes</summary>
          {declared.map((hash) => (
            <div className="ti-declared-signer" key={hash}>
              <Identifier value={hash} label="required signer hash" />
              <span>
                {inspection.signatures.some((s) => s.hash === hash && s.valid)
                  ? "Verified witness present"
                  : "No matching verified key witness"}
              </span>
            </div>
          ))}
        </details>
      )}
    </Panel>
  );
}
function LedgerActions({
  inspection,
  valid,
}: {
  inspection: TransactionInspection;
  valid: boolean;
}) {
  const { body, certs } = inspection;
  const votes = body.votingProcedures()?.toCore() ?? [],
    proposals = body.proposalProcedures()?.values() ?? [],
    withdrawals = [...(body.withdrawals() ?? [])];
  const donation = body.donation();
  if (
    !certs.length &&
    !votes.length &&
    !proposals.length &&
    !withdrawals.length &&
    !donation
  )
    return null;
  return (
    <Panel title={`Ledger actions${valid ? "" : " · not applied"}`}>
      <div className="ti-action-grid">
        {withdrawals.map(([address, value]) => {
          const scriptHook =
            value === 0n &&
            Core.Address.fromBech32(address).asReward()?.getPaymentCredential()
              .type === Core.CredentialType.ScriptHash;
          return (
            <article key={address}>
              <span className="ti-action-icon">{scriptHook ? "⌘" : "↙"}</span>
              <h3>
                {scriptHook ? "Staking script execution" : "Reward withdrawal"}
              </h3>
              <strong>
                {scriptHook ? "No ADA withdrawn" : formatAda(value)}
              </strong>
              <HashLink kind="account" id={address} full />
              {scriptHook && (
                <span>
                  A zero-value withdrawal invokes this staking validator.
                </span>
              )}
            </article>
          );
        })}
        {donation !== undefined && donation > 0n && (
          <article>
            <span className="ti-action-icon">◎</span>
            <h3>Treasury donation</h3>
            <strong>{formatAda(donation)}</strong>
            <span>To the Cardano treasury</span>
          </article>
        )}
        {certs.map((c, i) => (
          <article key={i}>
            <span className="ti-action-icon">◈</span>
            <h3>{readableName(c.__typename)}</h3>
            <RawValue value={c} label="Certificate fields" />
          </article>
        ))}
        {votes.flatMap(({ voter, votes }) =>
          votes.map((v, i) => (
            <article key={`${voter.credential.hash}:${i}`}>
              <span className="ti-action-icon">⚑</span>
              <h3>{["No", "Yes", "Abstain"][v.votingProcedure.vote]} vote</h3>
              <span>{readableName(voter.__typename)}</span>
              <Identifier value={voter.credential.hash} label="voter hash" />
              <RawValue
                value={{ action: v.actionId, anchor: v.votingProcedure.anchor }}
                label="Action & vote anchor"
              />
            </article>
          )),
        )}
        {proposals.map((p, i) => (
          <article key={i}>
            <span className="ti-action-icon">§</span>
            <h3>Governance proposal</h3>
            <strong>{formatAda(p.deposit())} deposit</strong>
            <HashLink kind="account" id={p.rewardAccount()} full />
            <RawValue value={p.toCore()} label="Proposal & anchor" />
          </article>
        ))}
      </div>
    </Panel>
  );
}
function Metadata({ inspection }: { inspection: TransactionInspection }) {
  if (!inspection.metadata.length) return null;
  const names: Record<string, string> = {
    "721": "NFT metadata · CIP-25",
    "674": "Transaction message · CIP-20",
  };
  return (
    <Panel title="Messages carried on chain">
      <div className="ti-metadata-grid">
        {inspection.metadata.map(([label, value]) => (
          <article key={label.toString()}>
            <span className="ti-metadata-label">{label.toString()}</span>
            <div>
              <h3>{names[label.toString()] ?? "Transaction metadata"}</h3>
              <pre>{transactionJson(value)}</pre>
              <CopyButton
                value={transactionJson(value)}
                label="metadata JSON"
              />
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
export function TransactionInsights({
  inspection,
  inputs,
  valid,
}: {
  inspection: TransactionInspection;
  inputs?: LedgerUtxo[];
  valid: boolean;
}) {
  return (
    <div className="ti-insights">
      {inputs && (
        <>
          <AssetActivity inspection={inspection} inputs={inputs} valid={valid} />
          <Execution inspection={inspection} inputs={inputs} />
        </>
      )}
      <LedgerActions inspection={inspection} valid={valid} />
      <div className="ti-detail-columns">
        <Signing inspection={inspection} />
        <Panel title="Anatomy of the bytes">
          <div className="ti-byte-total">
            <strong>{inspection.totalBytes.toLocaleString()}</strong>
            <span>serialized bytes</span>
          </div>
          <div
            className="ti-byte-bar"
            aria-label="Serialized byte distribution"
          >
            {inspection.bytes.map((p) => (
              <span
                key={p.label}
                style={{
                  width: `${(p.value / inspection.totalBytes) * 100}%`,
                  background: p.color,
                }}
                title={`${p.label}: ${p.value} bytes`}
              />
            ))}
          </div>
          <div className="ti-byte-legend">
            {inspection.bytes.map((p) => (
              <div key={p.label}>
                <i style={{ background: p.color }} />
                <span>{p.label}</span>
                <b>{p.value.toLocaleString()} B</b>
              </div>
            ))}
          </div>
          <p className="ti-note">
            Body bytes determine the transaction ID. Witnesses authorize it;
            auxiliary data carries its messages.
          </p>
        </Panel>
      </div>
      <Metadata inspection={inspection} />
    </div>
  );
}
