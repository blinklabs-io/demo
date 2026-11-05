import { useMemo, useState } from "react";
import { Core } from "@blaze-cardano/sdk";
import { formatAda, formatAddress } from "../../lib/format";
import { assetName } from "../../lib/tools/transactions";
import { fraction, visualColors } from "../../lib/chain/geometry";
import { CopyButton } from "../explorer/CopyButton";
import "./transaction-rehearsal.css";

export function TransactionRehearsalCbor({ cbor }: { cbor: string }) {
  const decoded = useMemo(() => {
    try {
      return { tx: Core.Transaction.fromCbor(Core.TxCBOR(cbor)) };
    } catch (cause) {
      return {
        error:
          cause instanceof Error ? cause.message : "Invalid transaction CBOR.",
      };
    }
  }, [cbor]);
  return decoded.tx ? (
    <TransactionRehearsal tx={decoded.tx} />
  ) : (
    <p role="alert" className="rehearsal-error">
      Transaction rehearsal unavailable: {decoded.error}
    </p>
  );
}

export function TransactionRehearsal({ tx }: { tx: Core.Transaction }) {
  const [selectedUnit, setSelectedUnit] = useState("lovelace");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const body = tx.body(),
    outputs = body.outputs();
  const mint = [...(body.mint() ?? [])];
  const units = [
    ...new Set([
      "lovelace",
      ...outputs.flatMap((output) => [
        ...(output.amount().multiasset()?.keys() ?? []),
      ]),
      ...mint.map(([unit]) => unit),
    ]),
  ];
  const unit = units.includes(selectedUnit) ? selectedUnit : "lovelace";
  const amount = (output: Core.TransactionOutput) =>
    unit === "lovelace"
      ? output.amount().coin()
      : (output.amount().multiasset()?.get(Core.AssetId(unit)) ?? 0n);
  const values = outputs.map(amount),
    total = values.reduce((sum, value) => sum + value, 0n);
  const index = selectedIndex < outputs.length ? selectedIndex : 0,
    selected = outputs[index];
  const display = (value: bigint, asset = unit) =>
    asset === "lovelace"
      ? formatAda(value)
      : `${value.toLocaleString()} raw units`;
  const withdrawals = [...(body.withdrawals() ?? [])];
  const withdrawn = withdrawals.reduce((sum, [, value]) => sum + value, 0n);
  const collateralReturn = body.collateralReturn();
  const valid = tx.isValid();
  return (
    <section
      className="transaction-rehearsal"
      aria-label="Transaction rehearsal"
    >
      <header className="rehearsal-heading">
        <div>
          <span className="eyebrow">Read the actual transaction</span>
          <h3>Rehearse the transaction.</h3>
        </div>
        <span className={`rehearsal-state${valid ? "" : " invalid"}`}>
          {valid ? "Transaction body" : "Script-invalid flag"}
        </span>
      </header>
      <div className="rehearsal-path" aria-label="Transaction structure">
        <div>
          <strong>{body.inputs().size()}</strong>
          <span>spending inputs</span>
        </div>
        <i aria-hidden="true">→</i>
        <div className="rehearsal-core">
          <span className="rehearsal-core-symbol" aria-hidden="true">
            ◈
          </span>
          <b>One transaction</b>
          <span>{display(body.fee(), "lovelace")} declared fee</span>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <strong>{outputs.length}</strong>
          <span>{valid ? "declared outputs" : "outputs not applied"}</span>
        </div>
      </div>
      <div className="rehearsal-allocation-heading">
        <div>
          <span className="eyebrow">
            Output allocation{valid ? "" : " · not applied"}
          </span>
          <strong>{display(total)}</strong>
        </div>
        <label>
          Asset
          <select
            aria-label="Rehearsal asset"
            value={unit}
            onChange={(event) => setSelectedUnit(event.target.value)}
          >
            {units.map((asset) => (
              <option value={asset} key={asset}>
                {asset === "lovelace"
                  ? "ADA"
                  : `${assetName(asset)} · ${asset.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {unit !== "lovelace" && (
        <div className="rehearsal-asset-id">
          <code>{unit}</code>
          <CopyButton value={unit} label="selected asset ID" />
        </div>
      )}
      {total > 0n ? (
        <div
          className="rehearsal-allocation"
          aria-label="Output value distribution"
        >
          {values.map(
            (value, i) =>
              value > 0n && (
                <button
                  key={i}
                  type="button"
                  aria-label={`Inspect output ${i + 1}: ${display(value)}`}
                  aria-pressed={index === i}
                  style={{
                    width: `${fraction(value, total) * 100}%`,
                    background: visualColors[i % visualColors.length],
                  }}
                  onClick={() => setSelectedIndex(i)}
                >
                  <span>
                    {fraction(value, total) >= 0.08
                      ? `${(fraction(value, total) * 100).toFixed(1)}%`
                      : ""}
                  </span>
                </button>
              ),
          )}
        </div>
      ) : (
        <p className="rehearsal-note">
          No {unit === "lovelace" ? "ADA" : "selected asset"} in the declared
          outputs.
        </p>
      )}
      <div
        className="rehearsal-output-choices"
        aria-label="Inspect declared outputs"
      >
        {outputs.map((_, i) => (
          <button
            type="button"
            key={i}
            aria-pressed={index === i}
            onClick={() => setSelectedIndex(i)}
            style={
              {
                "--output-color": visualColors[i % visualColors.length],
              } as React.CSSProperties
            }
          >
            <i aria-hidden="true" />
            Output {i + 1}
            <b>{display(values[i])}</b>
          </button>
        ))}
      </div>
      {selected && (
        <article
          className="rehearsal-output"
          aria-label={`Selected output ${index + 1}`}
        >
          <div>
            <span className="eyebrow">
              Output {index + 1} · full destination
            </span>
            <strong>{display(values[index])}</strong>
          </div>
          <div className="rehearsal-address">
            <code>{formatAddress(selected.address())}</code>
            <CopyButton
              value={formatAddress(selected.address())}
              label={`output ${index + 1} address`}
            />
          </div>
          <div className="rehearsal-output-facts">
            <span>{formatAda(selected.amount().coin())}</span>
            <span>
              {selected.amount().multiasset()?.size ?? 0} native assets
            </span>
            {selected.datum() && (
              <span>
                {selected.datum()!.asInlineData()
                  ? "Inline datum"
                  : "Datum hash"}
              </span>
            )}
            {selected.scriptRef() && <span>Reference script</span>}
          </div>
        </article>
      )}
      <div className="rehearsal-effects">
        {withdrawals.length > 0 && (
          <div>
            <span>Reward withdrawals{valid ? "" : " · not applied"}</span>
            <strong>{formatAda(withdrawn)}</strong>
            <small>
              {withdrawals.length} reward accounts
              {withdrawals.some(([, value]) => value === 0n)
                ? " · includes zero-value script invocation"
                : ""}
            </small>
          </div>
        )}
        {mint.length > 0 && (
          <div>
            <span>Asset supply changes{valid ? "" : " · not applied"}</span>
            <strong>
              {mint.filter(([, value]) => value > 0n).length} minted assets ·{" "}
              {mint.filter(([, value]) => value < 0n).length} burned assets
            </strong>
            <details>
              <summary>Exact asset changes</summary>
              {mint.map(([asset, quantity]) => (
                <p key={asset}>
                  <b>
                    {quantity > 0n ? "+" : ""}
                    {quantity.toString()} raw units · {assetName(asset)}
                  </b>
                  <code>{asset}</code>
                </p>
              ))}
            </details>
          </div>
        )}
        {(body.certs()?.size() ?? 0) > 0 && (
          <div>
            <span>Certificates{valid ? "" : " · not applied"}</span>
            <strong>{body.certs()!.size()}</strong>
            <small>Staking and credential actions</small>
          </div>
        )}
        {(body.donation() ?? 0n) > 0n && (
          <div>
            <span>Treasury donation{valid ? "" : " · not applied"}</span>
            <strong>{formatAda(body.donation()!)}</strong>
          </div>
        )}
      </div>
      {(body.referenceInputs()?.size() ?? 0) > 0 && (
        <div className="rehearsal-reference">
          <span aria-hidden="true">⌘</span>
          <div>
            <strong>{body.referenceInputs()!.size()} reference inputs</strong>
            <span>Read by the transaction; not spent.</span>
          </div>
        </div>
      )}
      {(body.collateral()?.size() ?? 0) > 0 && (
        <aside
          className={`rehearsal-collateral${valid ? "" : " invalid"}`}
          aria-label="Collateral path"
        >
          <span aria-hidden="true">◇</span>
          <div>
            <strong>
              {body.collateral()!.size()} collateral inputs · separate failure
              path
            </strong>
            <p>
              {valid
                ? "Collateral is not spent when scripts succeed."
                : "This transaction declares script failure. Spending inputs and ordinary outputs are not applied."}
            </p>
            {body.totalCollateral() !== undefined && (
              <p>
                {formatAda(body.totalCollateral()!)} declared total collateral
              </p>
            )}
            {collateralReturn && (
              <details>
                <summary>
                  Collateral return ·{" "}
                  {formatAda(collateralReturn.amount().coin())}
                </summary>
                <div className="rehearsal-address">
                  <code>{formatAddress(collateralReturn.address())}</code>
                  <CopyButton
                    value={formatAddress(collateralReturn.address())}
                    label="collateral return address"
                  />
                </div>
                {[...(collateralReturn.amount().multiasset() ?? [])].map(
                  ([asset, quantity]) => (
                    <p key={asset}>
                      {quantity.toString()} raw units · {assetName(asset)}
                      <code>{asset}</code>
                    </p>
                  ),
                )}
              </details>
            )}
          </div>
        </aside>
      )}
      <p className="rehearsal-note">
        Decoded from the transaction body. Input values and destination
        ownership are not inferred; output allocation is not a wallet balance
        forecast.
      </p>
    </section>
  );
}
