import { Core } from "@blaze-cardano/sdk";
import { bytesToHex } from "../dingo/utxorpc/bytes";

export function decodeBlockResources(bytes: Uint8Array) {
  const reader = new Core.CborReader(Core.HexBlob(bytesToHex(bytes)));
  const length = reader.readStartArray();
  if (length !== 2 && length !== 4 && length !== 5)
    throw new Error("Unsupported block encoding");
  const header = new Core.CborReader(Core.HexBlob.fromBytes(reader.readEncodedValue()));
  if (header.readStartArray() !== 2) throw new Error("Invalid block header");
  const fields = header.readStartArray();
  const sizeIndex = fields === 10 || fields === 12 ? 6 : fields === 15 ? 7 : undefined;
  if (sizeIndex === undefined) throw new Error("Unsupported block header");
  for (let i = 0; i < sizeIndex; i++) header.skipValue();
  const bodySize = header.readUInt();
  if (bodySize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid block body size");
  let memory = 0n, steps = 0n;
  if (length === 2) {
    if (reader.readStartArray() !== 3) throw new Error("Invalid Dijkstra block body");
    reader.readStartArray();
    while (reader.peekState() !== Core.CborReaderState.EndArray) {
      const units = dijkstraTransactionResources(reader);
      memory += units.memory;
      steps += units.steps;
    }
    reader.readEndArray();
    reader.skipValue();
    reader.skipValue();
    reader.readEndArray();
  } else {
    reader.skipValue();
    reader.readStartArray();
    while (reader.peekState() !== Core.CborReaderState.EndArray) {
      const witness = Core.TransactionWitnessSet.fromCbor(
        Core.HexBlob.fromBytes(reader.readEncodedValue()),
      );
      for (const redeemer of witness.redeemers()?.values() ?? []) {
        memory += redeemer.exUnits().mem();
        steps += redeemer.exUnits().steps();
      }
    }
    reader.readEndArray();
    reader.skipValue();
    if (length === 5) reader.skipValue();
  }
  reader.readEndArray();
  if (reader.peekState() !== Core.CborReaderState.Finished)
    throw new Error("Trailing block data");
  return { bytes: Number(bodySize), memory, steps, ...(length === 2 ? { rankingBody: true } : {}) };
}

function dijkstraTransactionResources(reader: Core.CborReader, sub = false): { memory: bigint; steps: bigint } {
  if (reader.readStartArray() !== (sub ? 3 : 4)) throw new Error("Invalid Dijkstra block transaction");
  let memory = 0n, steps = 0n;
  reader.readStartMap();
  while (reader.peekState() !== Core.CborReaderState.EndMap) {
    const key = reader.readUInt();
    if (sub || key !== 23n) { reader.skipValue(); continue; }
    if (reader.peekState() === Core.CborReaderState.Tag && Number(reader.readTag()) !== 258)
      throw new Error("Invalid subtransaction set tag");
    reader.readStartArray();
    while (reader.peekState() !== Core.CborReaderState.EndArray) {
      const units = dijkstraTransactionResources(reader, true);
      memory += units.memory;
      steps += units.steps;
    }
    reader.readEndArray();
  }
  reader.readEndMap();
  reader.readStartMap();
  while (reader.peekState() !== Core.CborReaderState.EndMap) {
    const key = reader.readUInt();
    if (key !== 5n) { reader.skipValue(); continue; }
    reader.readStartMap();
    while (reader.peekState() !== Core.CborReaderState.EndMap) {
      reader.skipValue();
      if (reader.readStartArray() !== 2) throw new Error("Invalid Dijkstra redeemer");
      reader.skipValue();
      if (reader.readStartArray() !== 2) throw new Error("Invalid execution units");
      memory += reader.readUInt();
      steps += reader.readUInt();
      reader.readEndArray();
      reader.readEndArray();
    }
    reader.readEndMap();
  }
  reader.readEndMap();
  reader.skipValue();
  if (!sub) reader.readBoolean();
  reader.readEndArray();
  return { memory, steps };
}

export function blockResourceUsage(
  bytes: number,
  units: { memory: bigint; steps: bigint },
  limits: { bytes: number; memory: bigint | null; steps: bigint | null },
) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 ||
      !Number.isSafeInteger(limits.bytes) || limits.bytes <= 0)
    throw new Error("Invalid block byte limit or usage");
  const resources = [
    { label: "Body bytes", used: BigInt(bytes), limit: BigInt(limits.bytes) },
    { label: "Execution memory", used: units.memory, limit: limits.memory },
    { label: "Execution steps", used: units.steps, limit: limits.steps },
  ].map((resource) => {
    if (resource.used < 0n ||
        (resource.limit !== null && resource.limit <= 0n) ||
        (resource.limit === null && resource.used !== 0n))
      throw new Error("Invalid block execution limit or usage");
    return { ...resource, percent: resource.limit === null ? null :
      Number(resource.used * 1000n / resource.limit) / 10 };
  });
  const bottleneck = resources.reduce((max, resource) =>
    resource.limit !== null && max.limit !== null &&
    resource.used * max.limit > max.used * resource.limit ? resource : max);
  return { resources, bottleneck, percent: bottleneck.percent! };
}
