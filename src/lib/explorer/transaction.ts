import { activityLabels, transactionActivity } from "../chain/transactionActivity";
import { useMemo } from "react";
import { Core } from "@blaze-cardano/sdk";

export interface LedgerUtxo {
  address: string;
  tx_hash?: string;
  output_index: number;
  amount: { unit: string; quantity: string }[];
  collateral: boolean;
  reference?: boolean;
  data_hash?: string | null;
  inline_datum?: string | null;
  reference_script_hash?: string | null;
  consumed_by_tx?: string | null;
}
export interface TransactionRecord {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  fees: string;
  deposit: string;
  treasury_donation: string;
  size: number;
  valid_contract: boolean;
  invalid_before: string | null;
  invalid_hereafter: string | null;
}
export function transactionJson(value: unknown) {
  return JSON.stringify(
    value,
    (_, v) =>
      typeof v === "bigint"
        ? v.toString()
        : v instanceof Map
          ? [...v]
          : v instanceof Uint8Array
            ? Core.toHex(v)
            : v,
    2,
  );
}
export function readChainTransactionEnvelope(cbor: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(cbor) || cbor.length > 262144)
    throw new Error("Dingo returned invalid or oversized transaction CBOR.");
  const reader = new Core.CborReader(Core.HexBlob(cbor));
  const length = reader.readStartArray();
  if (length !== null && length !== 3 && length !== 4)
    throw new Error("Expected a three- or four-item transaction envelope.");
  const items: string[] = [];
  while (reader.peekState() !== Core.CborReaderState.EndArray) {
    if (items.length === 4)
      throw new Error("Transaction envelope contains too many items.");
    items.push(Core.toHex(reader.readEncodedValue()));
  }
  reader.readEndArray();
  if (items.length !== 3 && items.length !== 4)
    throw new Error("Expected a complete transaction envelope.");
  if (reader.getBytesRemaining())
    throw new Error("Unexpected data after the transaction envelope.");
  const validity =
    items.length === 4
      ? new Core.CborReader(Core.HexBlob(items[2])).readBoolean()
      : true;
  return {
    bodyCbor: items[0],
    witnessCbor: items[1],
    auxiliaryCbor: items.at(-1)!,
    validity,
    bodyBytes: items[0].length / 2,
    witnessBytes: items[1].length / 2,
  };
}
export function inspectChainTransaction(cbor: string, hash: string) {
  const envelope = readChainTransactionEnvelope(cbor);
  const tx = Core.Transaction.fromCbor(Core.TxCBOR(cbor));
  if (tx.getId() !== hash.toLowerCase())
    throw new Error(
      "Transaction CBOR does not match the requested transaction ID.",
    );
  const body = tx.body(),
    witness = tx.witnessSet();
  if (tx.isValid() !== envelope.validity)
    throw new Error(
      "Decoded transaction validity flag does not match its envelope.",
    );
  const { bodyBytes, witnessBytes } = envelope;
  const auxiliaryHash = body.auxiliaryDataHash();
  const auxiliaryIsNull = envelope.auxiliaryCbor === "f6";
  if (
    auxiliaryIsNull
      ? auxiliaryHash !== undefined
      : auxiliaryHash !== Core.blake2b_256(Core.HexBlob(envelope.auxiliaryCbor))
  )
    throw new Error("Transaction auxiliary data does not match the body hash.");
  const totalBytes = cbor.length / 2;
  const signatures = (witness.vkeys()?.values() ?? []).map((w) => {
    const key = Core.Ed25519PublicKey.fromHex(w.vkey());
    return {
      key: w.vkey(),
      hash: key.hash().hex(),
      signature: w.signature(),
      valid: key.verify(
        Core.Ed25519Signature.fromHex(w.signature()),
        Core.HexBlob(tx.getId()),
      ),
    };
  });
  const scripts = [
    ...(witness.nativeScripts()?.values() ?? []).map((script) => ({
      language: "Native",
      hash: String(script.hash()),
      cbor: String(script.toCbor()),
      data: script.toCore(),
    })),
    ...(witness.plutusV1Scripts()?.values() ?? []).map((script) => ({
      language: "Plutus V1",
      hash: String(script.hash()),
      cbor: String(script.toCbor()),
      data: null,
    })),
    ...(witness.plutusV2Scripts()?.values() ?? []).map((script) => ({
      language: "Plutus V2",
      hash: String(script.hash()),
      cbor: String(script.toCbor()),
      data: null,
    })),
    ...(witness.plutusV3Scripts()?.values() ?? []).map((script) => ({
      language: "Plutus V3",
      hash: String(script.hash()),
      cbor: String(script.toCbor()),
      data: null,
    })),
  ];
  const redeemers = (witness.redeemers()?.values() ?? []).map((r) => ({
    purpose:
      ["Spend", "Mint", "Certificate", "Withdrawal", "Vote", "Proposal"][
        r.tag()
      ] ?? `Purpose ${r.tag()}`,
    index: r.index(),
    memory: r.exUnits().mem(),
    steps: r.exUnits().steps(),
    data: r.data().toCore(),
    cbor: String(r.data().toCbor()),
  }));
  const metadata = [...(tx.auxiliaryData()?.metadata()?.metadata() ?? [])].map(
    ([label, value]) => [label, value.toCore()] as const,
  );
  const certs = (body.certs()?.values() ?? []).map((c) => c.toCore());
  return {
    tx,
    body,
    witness,
    signatures,
    scripts,
    redeemers,
    metadata,
    certs,
    bytes: [
      { label: "Body", value: bodyBytes, color: "#5eead4" },
      { label: "Witnesses", value: witnessBytes, color: "#c4b5fd" },
      {
        label: "Auxiliary & envelope",
        value: totalBytes - bodyBytes - witnessBytes,
        color: "#fbbf24",
      },
    ],
    totalBytes,
  };
}
export type TransactionInspection = ReturnType<typeof inspectChainTransaction>;
export function transactionKind(inspection: TransactionInspection) {
  return activityLabels[transactionActivity(inspection.tx)];
}
export function readableName(name: string) {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

export function useTransactionInspection(
  cbor: string | undefined,
  hash: string | undefined,
) {
  return useMemo(() => {
    if (!cbor || !hash) return null;
    try {
      return { data: inspectChainTransaction(cbor, hash), error: null };
    } catch (e) {
      return {
        data: null,
        error:
          e instanceof Error ? e.message : "Could not decode transaction CBOR.",
      };
    }
  }, [cbor, hash]);
}
