import { Core } from "@blaze-cardano/sdk";
import { inspectChainTransaction, type LedgerUtxo } from "./transaction";

export type DataTree =
  | { int: string }
  | { bytes: string }
  | { list: DataTree[] }
  | { map: { k: DataTree; v: DataTree }[] }
  | { constructor: string; fields: DataTree[] };

function boundEncoding(cbor: string, dataOnly: boolean) {
  if (cbor.length > 262144)
    throw new Error("Transaction CBOR exceeds 128 KiB.");
  const encodedItems = [{ cbor, depth: 0 }];
  let nodes = 0;
  while (encodedItems.length) {
    const item = encodedItems.pop()!;
    const reader = new Core.CborReader(Core.HexBlob(item.cbor));
    const containers: ("array" | "map")[] = [];
    let complete = false;
    while (!complete) {
      const state = reader.peekState();
      const end =
        state === Core.CborReaderState.EndArray ||
        state === Core.CborReaderState.EndMap;
      if (item.depth + containers.length > 64 || (!end && ++nodes > 2048))
        throw new Error(
          "Data exceeds the workbench's 2,048-node or 64-level display limit.",
        );
      switch (state) {
        case Core.CborReaderState.Tag: {
          const tag = reader.readTag();
          if (!dataOnly && tag === 24) {
            const bytes = reader.readByteString();
            encodedItems.push({
              cbor: String(Core.HexBlob.fromBytes(bytes)),
              depth: item.depth + containers.length + 1,
            });
            break;
          }
          continue;
        }
        case Core.CborReaderState.StartArray:
          reader.readStartArray();
          containers.push("array");
          continue;
        case Core.CborReaderState.StartMap:
          reader.readStartMap();
          containers.push("map");
          continue;
        case Core.CborReaderState.EndArray:
          reader.readEndArray();
          containers.pop();
          break;
        case Core.CborReaderState.EndMap:
          reader.readEndMap();
          containers.pop();
          break;
        case Core.CborReaderState.UnsignedInteger:
        case Core.CborReaderState.NegativeInteger:
          reader.readInt();
          break;
        case Core.CborReaderState.ByteString:
        case Core.CborReaderState.StartIndefiniteLengthByteString:
          reader.readByteString();
          break;
        case Core.CborReaderState.TextString:
        case Core.CborReaderState.StartIndefiniteLengthTextString:
          if (dataOnly)
            throw new Error("Text is not Plutus data; encode it as bytes.");
          reader.readTextString();
          break;
        case Core.CborReaderState.Boolean:
          if (dataOnly)
            throw new Error("Booleans are not Plutus data primitives.");
          reader.readBoolean();
          break;
        case Core.CborReaderState.Null:
          if (dataOnly) throw new Error("Null is not Plutus data.");
          reader.readNull();
          break;
        case Core.CborReaderState.HalfPrecisionFloat:
        case Core.CborReaderState.SinglePrecisionFloat:
        case Core.CborReaderState.DoublePrecisionFloat:
          if (dataOnly)
            throw new Error("Floating point values are not Plutus data.");
          reader.readDouble();
          break;
        case Core.CborReaderState.SimpleValue:
          if (dataOnly) throw new Error("Simple values are not Plutus data.");
          reader.readSimpleValue();
          break;
        default:
          throw new Error(
            "Expected Plutus integers, bytes, lists, maps, or constructors.",
          );
      }
      complete = containers.length === 0;
    }
    if (reader.getBytesRemaining())
      throw new Error("Unexpected bytes after Plutus data.");
  }
}

export function decodePlutusData(input: string) {
  const cbor = input.trim().toLowerCase();
  if (!/^(?:[a-f0-9]{2})+$/.test(cbor) || cbor.length > 131072)
    throw new Error("Enter Plutus data CBOR hex, up to 64 KiB.");
  boundEncoding(cbor, true);
  const data = Core.PlutusData.fromCbor(Core.HexBlob(cbor));
  let nodes = 0;
  function tree(value: Core.PlutusData, depth = 0): DataTree {
    if (++nodes > 2048 || depth > 64)
      throw new Error(
        "Data exceeds the workbench's 2,048-node or 64-level display limit.",
      );
    const integer = value.asInteger();
    if (integer !== undefined) return { int: integer.toString() };
    const bytes = value.asBoundedBytes();
    if (bytes !== undefined) return { bytes: Core.toHex(bytes) };
    const list = value.asList();
    if (list)
      return {
        list: Array.from({ length: list.getLength() }, (_, i) =>
          tree(list.get(i), depth + 1),
        ),
      };
    if (value.asMap()) {
      // SDK lookup compares keys by value and conflates repeated keys.
      const encoded = new Core.CborReader(value.toCbor());
      encoded.readStartMap();
      const pairs: { k: DataTree; v: DataTree }[] = [];
      while (encoded.peekState() !== Core.CborReaderState.EndMap) {
        const key = Core.PlutusData.fromCbor(
          Core.HexBlob.fromBytes(encoded.readEncodedValue()),
        );
        const entry = Core.PlutusData.fromCbor(
          Core.HexBlob.fromBytes(encoded.readEncodedValue()),
        );
        pairs.push({ k: tree(key, depth + 1), v: tree(entry, depth + 1) });
      }
      encoded.readEndMap();
      return { map: pairs };
    }
    const constr = value.asConstrPlutusData();
    if (!constr) throw new Error("Unsupported Plutus data value.");
    const fields = constr.getData();
    return {
      constructor: constr.getAlternative().toString(),
      fields: Array.from({ length: fields.getLength() }, (_, i) =>
        tree(fields.get(i), depth + 1),
      ),
    };
  }
  return {
    cbor,
    hash: String(data.hash()),
    tree: tree(data),
    bytes: cbor.length / 2,
  };
}

export interface WorkbenchItem {
  id: string;
  label: string;
  cbor: string;
  context: string;
  sourceHash?: string;
  outputIndex?: number;
  scriptHash?: string;
  referenceScriptHash?: string;
}

export function transactionDataItems(
  cbor: string,
  hash: string,
): WorkbenchItem[] {
  boundEncoding(cbor, false);
  const inspection = inspectChainTransaction(cbor, hash);
  const { body, witness, redeemers } = inspection;
  const inputs = [...body.inputs().values()].sort(
    (a, b) =>
      (a.transactionId() < b.transactionId()
        ? -1
        : a.transactionId() > b.transactionId()
          ? 1
          : 0) || Number(a.index()) - Number(b.index()),
  );
  const items: WorkbenchItem[] = [];
  for (const [index, output] of body.outputs().entries()) {
    const datum = output.datum()?.asInlineData();
    if (datum)
      items.push({
        id: `output-${index}`,
        label: `Output ${index} · inline datum`,
        cbor: String(datum.toCbor()),
        context: "Inline datum carried by this transaction output.",
        sourceHash: hash,
        outputIndex: index,
        scriptHash: paymentScriptHash(String(output.address().toBech32())),
        referenceScriptHash: output.scriptRef()
          ? String(output.scriptRef()!.hash())
          : undefined,
      });
  }
  const collateralReturn = body.collateralReturn();
  const collateralDatum = collateralReturn?.datum()?.asInlineData();
  if (collateralReturn && collateralDatum)
    items.push({
      id: "collateral-return",
      label: "Collateral return · inline datum",
      cbor: String(collateralDatum.toCbor()),
      context:
        "Collateral return on the script-failure path; not an ordinary output.",
      sourceHash: hash,
      outputIndex: body.outputs().length,
      scriptHash: paymentScriptHash(
        String(collateralReturn.address().toBech32()),
      ),
      referenceScriptHash: collateralReturn.scriptRef()
        ? String(collateralReturn.scriptRef()!.hash())
        : undefined,
    });
  for (const [index, datum] of (witness.plutusData()?.values() ?? []).entries())
    items.push({
      id: `witness-${index}`,
      label: `Witness datum ${index}`,
      cbor: String(datum.toCbor()),
      context:
        "Datum supplied in the witness set. Its hash can be matched to an input datum hash.",
    });
  for (const [index, redeemer] of redeemers.entries()) {
    const input =
      redeemer.purpose === "Spend" && redeemer.index < BigInt(inputs.length)
        ? inputs[Number(redeemer.index)]
        : undefined;
    items.push({
      id: `redeemer-${index}`,
      label: `${redeemer.purpose} redeemer #${redeemer.index}`,
      cbor: redeemer.cbor,
      context: `Declared execution budget: ${redeemer.memory} memory, ${redeemer.steps} steps.${input ? " Spending input resolved by ledger ordering (transaction ID, then output index)." : " Index identifies the ledger-ordered purpose entry; no script ownership is inferred."}`,
      sourceHash: input ? String(input.transactionId()) : undefined,
      outputIndex: input ? Number(input.index()) : undefined,
    });
  }
  return items;
}

export function inputDataItems(inputs: LedgerUtxo[]): WorkbenchItem[] {
  return inputs.flatMap((input, index) =>
    input.inline_datum
      ? [
          {
            id: `input-${index}`,
            label: `${input.reference ? "Reference input" : input.collateral ? "Collateral input" : "Spending input"} ${index} · inline datum`,
            cbor: input.inline_datum,
            context: input.reference
              ? "Read by the transaction; not spent."
              : input.collateral
                ? "Collateral failure path."
                : "Datum from the resolved spending input.",
            sourceHash: input.tx_hash,
            outputIndex: input.output_index,
            scriptHash: paymentScriptHash(input.address),
            referenceScriptHash: input.reference_script_hash ?? undefined,
          },
        ]
      : [],
  );
}

export function paymentScriptHash(address: string): string | undefined {
  try {
    const credential = Core.Address.fromString(address)?.getProps().paymentPart;
    return credential?.type === Core.CredentialType.ScriptHash
      ? String(credential.hash)
      : undefined;
  } catch {
    return undefined;
  }
}
