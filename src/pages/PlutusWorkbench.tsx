import { useId, useState } from "react";
import { useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageIntro } from "../components/explorer/Visuals";
import { CopyButton } from "../components/explorer/CopyButton";
import { Link } from "../components/NetworkLink";
import { BuildThis } from "../components/developer/BuildThis";
import { blockfrostFetch } from "../lib/dingo/blockfrost";
import { DINGO_CONFIG } from "../lib/dingo/config";
import {
  decodePlutusData,
  transactionDataItems,
  inputDataItems,
  paymentScriptHash,
  type WorkbenchItem,
} from "../lib/explorer/plutusWorkbench";
import { isTransactionHash } from "../lib/explorer/transactionTracking";
import type { LedgerUtxo } from "../lib/explorer/transaction";
import "../components/explorer/developer-tools.css";

function DataResult({ cbor }: { cbor: string }) {
  let decoded: ReturnType<typeof decodePlutusData>;
  try {
    decoded = decodePlutusData(cbor);
  } catch (error) {
    return (
      <p role="alert" className="developer-panel">
        {error instanceof Error
          ? error.message
          : "Could not decode this Plutus data."}
      </p>
    );
  }
  const json = JSON.stringify(decoded.tree, null, 2);
  return (
    <section className="developer-panel" aria-label="Decoded Plutus data">
      <header>
        <h2>Data, unpacked.</h2>
        <span className="developer-badge">
          {decoded.bytes.toLocaleString()} bytes
        </span>
      </header>
      <p className="developer-note">
        Integers and constructor indices are decimal strings to preserve
        precision. Bytes remain hex. Field names and contract meaning require
        the script's schema.
      </p>
      <div className="developer-identifier">
        <span>Data hash</span>
        <code>{decoded.hash}</code>
        <CopyButton value={decoded.hash} label="Plutus data hash" />
      </div>
      <header>
        <h3>Structured data</h3>
        <CopyButton value={json} label="decoded Plutus JSON" />
      </header>
      <pre className="developer-code">{json}</pre>
      <details>
        <summary>Original CBOR</summary>
        <CopyButton value={decoded.cbor} label="Plutus CBOR" />
        <pre className="developer-code">{decoded.cbor}</pre>
      </details>
    </section>
  );
}

export default function PlutusWorkbench() {
  const location = useLocation();
  return <WorkbenchBody key={location.key} />;
}

function WorkbenchBody() {
  const dataId = useId();
  const location = useLocation();
  const initial = location.state as {
    plutusCbor?: unknown;
    transactionHash?: unknown;
  } | null;
  const [raw, setRaw] = useState(
    typeof initial?.plutusCbor === "string" ? initial.plutusCbor : "",
  );
  const [decoded, setDecoded] = useState(raw);
  const [hashInput, setHashInput] = useState(
    typeof initial?.transactionHash === "string" ? initial.transactionHash : "",
  );
  const [hash, setHash] = useState(
    isTransactionHash(hashInput) ? hashInput.toLowerCase() : "",
  );
  const [selection, setSelected] = useState<WorkbenchItem | null>(null);
  const transaction = useQuery({
    queryKey: ["dingo", "tx", hash, "workbench"],
    enabled: !!hash,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await blockfrostFetch<{ cbor: string }>(
        `/api/v0/txs/${hash}/cbor`,
        { signal },
      );
      return transactionDataItems(result.cbor, hash);
    },
  });
  const utxos = useQuery({
    queryKey: ["dingo", "tx", hash, "utxos"],
    enabled: !!hash,
    retry: false,
    queryFn: ({ signal }) =>
      blockfrostFetch<{ inputs: LedgerUtxo[]; outputs: LedgerUtxo[] }>(
        `/api/v0/txs/${hash}/utxos`,
        { signal },
      ),
    select: (result) => {
      if (!result || !Array.isArray(result.inputs))
        throw new Error("Dingo returned invalid transaction inputs.");
      return {
        ...result,
        inputs: result.inputs.filter((input) => {
          const valid =
            input &&
            typeof input.address === "string" &&
            Number.isSafeInteger(input.output_index) &&
            input.output_index >= 0 &&
            typeof input.collateral === "boolean";
          if (!valid)
            console.warn("Skipping an unsupported transaction input record.");
          return valid;
        }),
      };
    },
  });
  const items = [
    ...(transaction.isError ? [] : (transaction.data ?? [])),
    ...(utxos.isError ? [] : inputDataItems(utxos.data?.inputs ?? [])),
  ];
  const selected = selection
    ? items.find(
        (item) => item.id === selection.id && item.cbor === selection.cbor,
      )
    : undefined;
  const selectedInput =
    selected?.sourceHash !== undefined
      ? (utxos.isError ? undefined : utxos.data)?.inputs.find(
          (input) =>
            input.tx_hash === selected.sourceHash &&
            input.output_index === selected.outputIndex,
        )
      : undefined;
  const selectedScript =
    selected?.scriptHash ??
    (selectedInput ? paymentScriptHash(selectedInput.address) : undefined);
  return (
    <div className="developer-page">
      <PageIntro
        eyebrow="CBOR → Plutus data → context"
        title="Datum & redeemer workbench"
        detail="Decode data locally, or inspect the datums and redeemers of an on-chain transaction."
        symbol="⌘"
      />
      <div className="workbench-columns">
        <section className="developer-panel">
          <span className="eyebrow">Local decoder</span>
          <h2>Inspect a data value.</h2>
          <form
            className="developer-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSelected(null);
              setDecoded(raw);
            }}
          >
            <label htmlFor={dataId}>Plutus data CBOR</label>
            <textarea
              id={dataId}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              maxLength={131072}
              rows={6}
              placeholder="d8799f182a4568656c6c6fff"
              required
            />
            <div className="developer-actions">
              <button type="submit" className="experience-primary">
                Decode data →
              </button>
              <button
                type="button"
                onClick={() => {
                  setRaw("d8799f182a4568656c6c6fff");
                  setDecoded("d8799f182a4568656c6c6fff");
                  setSelected(null);
                }}
              >
                Load example
              </button>
            </div>
          </form>
          <p className="developer-note">
            Paste the data value itself, rather than a transaction, datum hash,
            or script. Pasted CBOR stays in your browser.
          </p>
        </section>
        <section className="developer-panel">
          <span className="eyebrow">Transaction context</span>
          <h2>Load from the chain.</h2>
          <form
            className="developer-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (isTransactionHash(hashInput.trim())) {
                setSelected(null);
                setDecoded("");
                if (hash === hashInput.trim().toLowerCase()) {
                  void transaction.refetch();
                  void utxos.refetch();
                } else setHash(hashInput.trim().toLowerCase());
              }
            }}
          >
            <label>
              Transaction ID
              <input
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                maxLength={64}
                pattern="[0-9a-fA-F]{64}"
                required
                placeholder="64-character transaction hash"
              />
            </label>
            <button
              type="submit"
              className="experience-primary"
              disabled={transaction.isFetching || utxos.isFetching}
            >
              {transaction.isFetching || utxos.isFetching
                ? "Loading…"
                : "Load transaction →"}
            </button>
          </form>
          {hash && <Link to={`/explorer/tx/${hash}`}>Open transaction →</Link>}
          {transaction.error && (
            <p role="alert">Transaction data: {transaction.error.message}</p>
          )}
          {utxos.error && (
            <p role="alert">Input context: {utxos.error.message}</p>
          )}
          {hash &&
            transaction.isSuccess &&
            utxos.isSuccess &&
            !items.length && (
              <p>
                No inline datums or witness data found. Hash-only datums cannot
                be decoded without their original bytes.
              </p>
            )}
        </section>
      </div>
      {items.length > 0 && (
        <section className="developer-panel">
          <h2>Choose a datum or redeemer.</h2>
          <div className="workbench-items">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={selected?.id === item.id}
                onClick={() => {
                  setSelected(item);
                  setRaw(item.cbor);
                  setDecoded(item.cbor);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {!utxos.isError &&
        utxos.data?.inputs.some((input) => input.reference) && (
          <section className="developer-panel">
            <h2>Reference inputs & scripts</h2>
            <p className="developer-note">
              Reference scripts are available to this transaction; their
              presence does not establish which redeemer uses them.
            </p>
            {utxos.data.inputs
              .filter((input) => input.reference)
              .map((input, index) => (
                <div className="developer-actions" key={index}>
                  {input.tx_hash && (
                    <Link to={`/explorer/tx/${input.tx_hash}`}>
                      Source transaction · output {input.output_index} ↗
                    </Link>
                  )}
                  {input.reference_script_hash && (
                    <a
                      href={`${DINGO_CONFIG.blockfrostUrl}/api/v0/scripts/${input.reference_script_hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Script {input.reference_script_hash} ↗
                    </a>
                  )}
                  {input.data_hash && (
                    <code>Datum hash: {input.data_hash}</code>
                  )}
                </div>
              ))}
          </section>
        )}
      {selected && (
        <section className="developer-panel">
          <h2>{selected.label}</h2>
          <p>{selected.context}</p>
          <div className="developer-actions">
            {selected.sourceHash && (
              <Link to={`/explorer/tx/${selected.sourceHash}`}>
                Source transaction · output {selected.outputIndex} ↗
              </Link>
            )}
            {selected.referenceScriptHash && (
              <a
                href={`${DINGO_CONFIG.blockfrostUrl}/api/v0/scripts/${selected.referenceScriptHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Reference script API ↗
              </a>
            )}
            {selectedScript && (
              <a
                href={`${DINGO_CONFIG.blockfrostUrl}/api/v0/scripts/${selectedScript}`}
                target="_blank"
                rel="noreferrer"
              >
                Script API ↗
              </a>
            )}
          </div>
        </section>
      )}
      {decoded && (!selection || selected) && (
        <DataResult key={decoded} cbor={decoded} />
      )}
      <BuildThis recipe="workbench" />
    </div>
  );
}
