import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch } from "../dingo/blockfrost";

export const LEIOS_TRANSACTION_PAGE_SIZE = 100;
export interface LeiosTransaction {
  hash: string;
  bytes: number;
  fee: bigint;
  valid: boolean;
}

export function decodeLeiosTransaction(row: { tx_hash: string; cbor: string }): LeiosTransaction {
  if (!/^[a-f0-9]{64}$/.test(row.tx_hash) || !/^(?:[a-f0-9]{2})+$/i.test(row.cbor) || row.cbor.length > 32 * 1024 * 1024)
    throw new Error("Invalid Dijkstra transaction CBOR.");
  const reader = new Core.CborReader(Core.HexBlob(row.cbor));
  if (reader.readStartArray() !== 4) throw new Error("Invalid Dijkstra block transaction envelope.");
  const bodyBytes = reader.readEncodedValue();
  if (Core.blake2b_256(Core.HexBlob.fromBytes(bodyBytes)) !== row.tx_hash)
    throw new Error("Transaction hash does not match its body.");
  const body = new Core.CborReader(Core.HexBlob.fromBytes(bodyBytes));
  body.readStartMap();
  let fee: bigint | undefined;
  let auxiliaryHash: string | undefined;
  while (body.peekState() !== Core.CborReaderState.EndMap) {
    const key = body.readUInt();
    if (key === 2n) {
      if (fee !== undefined) throw new Error("Duplicate transaction fee.");
      fee = body.readUInt();
    } else if (key === 7n) {
      const hash = body.readByteString();
      if (auxiliaryHash !== undefined || hash.length !== 32) throw new Error("Invalid auxiliary data hash.");
      auxiliaryHash = Core.toHex(hash);
    } else body.skipValue();
  }
  body.readEndMap();
  if (body.getBytesRemaining() || fee === undefined) throw new Error("Missing or invalid transaction fee.");
  reader.readStartMap();
  while (reader.peekState() !== Core.CborReaderState.EndMap) { reader.readUInt(); reader.skipValue(); }
  reader.readEndMap();
  const auxiliary = reader.readEncodedValue();
  const aux = new Core.CborReader(Core.HexBlob.fromBytes(auxiliary));
  const skipMap = () => {
    aux.readStartMap();
    while (aux.peekState() !== Core.CborReaderState.EndMap) { aux.skipValue(); aux.skipValue(); }
    aux.readEndMap();
  };
  if (aux.peekState() === Core.CborReaderState.Null) {
    aux.readNull();
    if (auxiliaryHash !== undefined) throw new Error("Missing auxiliary data.");
  } else {
    if (aux.peekState() === Core.CborReaderState.Tag) {
      if (Number(aux.readTag()) !== 259) throw new Error("Invalid auxiliary data tag.");
      skipMap();
    } else if (aux.peekState() === Core.CborReaderState.StartArray) {
      if (aux.readStartArray() !== 2) throw new Error("Invalid auxiliary data array.");
      skipMap();
      aux.readStartArray();
      while (aux.peekState() !== Core.CborReaderState.EndArray) aux.skipValue();
      aux.readEndArray();
      aux.readEndArray();
    } else skipMap();
    if (auxiliaryHash !== Core.blake2b_256(Core.HexBlob.fromBytes(auxiliary))) throw new Error("Auxiliary data does not match its hash.");
  }
  if (aux.getBytesRemaining()) throw new Error("Trailing auxiliary data.");
  const valid = reader.readBoolean();
  reader.readEndArray();
  if (reader.getBytesRemaining()) throw new Error("Trailing Dijkstra transaction bytes.");
  return { hash: row.tx_hash, bytes: row.cbor.length / 2, fee, valid };
}

export async function readLeiosTransactionPage(hash: string, page: number, dijkstra: boolean, signal?: AbortSignal) {
  const raw = await blockfrostFetch<{ tx_hash: string; cbor: string }[]>(
    `/api/v0/blocks/${hash}/txs/cbor?page=${page}&count=${LEIOS_TRANSACTION_PAGE_SIZE}&order=asc`,
    { signal },
  );
  if (!Array.isArray(raw) || raw.length > LEIOS_TRANSACTION_PAGE_SIZE) throw new Error("Invalid transaction page.");
  const records: LeiosTransaction[] = [];
  const errors: { hash: string | null; message: string }[] = [];
  for (const row of raw) {
    try {
      if (dijkstra) records.push(decodeLeiosTransaction(row));
      else {
        const reader = new Core.CborReader(Core.HexBlob(row.cbor));
        const length = reader.readStartArray();
        if (length !== 3 && length !== 4) throw new Error("Invalid legacy transaction envelope.");
        const bodyBytes = reader.readEncodedValue();
        for (let i = 1; i < length; i++) reader.skipValue();
        reader.readEndArray();
        if (reader.getBytesRemaining()) throw new Error("Trailing transaction data.");
        const tx = Core.Transaction.fromCbor(Core.TxCBOR(row.cbor));
        if (Core.blake2b_256(Core.HexBlob.fromBytes(bodyBytes)) !== row.tx_hash) throw new Error("Transaction hash does not match its body.");
        records.push({ hash: row.tx_hash, bytes: row.cbor.length / 2, fee: tx.body().fee(), valid: tx.isValid() });
      }
    }
    catch (error) { errors.push({ hash: typeof row?.tx_hash === "string" && /^[a-f0-9]{64}$/.test(row.tx_hash) ? row.tx_hash : null, message: error instanceof Error ? error.message : "Cannot decode transaction." }); }
  }
  return { records, errors, count: raw.length };
}
