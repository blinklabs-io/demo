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
  while (body.peekState() !== Core.CborReaderState.EndMap) {
    if (body.readUInt() === 2n) {
      if (fee !== undefined) throw new Error("Duplicate transaction fee.");
      fee = body.readUInt();
    } else body.skipValue();
  }
  body.readEndMap();
  if (body.getBytesRemaining() || fee === undefined) throw new Error("Missing or invalid transaction fee.");
  reader.skipValue();
  reader.skipValue();
  const valid = reader.readBoolean();
  reader.readEndArray();
  if (reader.getBytesRemaining()) throw new Error("Trailing Dijkstra transaction bytes.");
  return { hash: row.tx_hash, bytes: row.cbor.length / 2, fee, valid };
}

export async function readLeiosTransactionPage(hash: string, page: number, signal?: AbortSignal) {
  const raw = await blockfrostFetch<{ tx_hash: string; cbor: string }[]>(
    `/api/v0/blocks/${hash}/txs/cbor?page=${page}&count=${LEIOS_TRANSACTION_PAGE_SIZE}&order=asc`,
    { signal },
  );
  if (!Array.isArray(raw) || raw.length > LEIOS_TRANSACTION_PAGE_SIZE) throw new Error("Invalid transaction page.");
  const records: LeiosTransaction[] = [];
  const errors: { hash: string | null; message: string }[] = [];
  for (const row of raw) {
    try { records.push(decodeLeiosTransaction(row)); }
    catch (error) { errors.push({ hash: typeof row?.tx_hash === "string" && /^[a-f0-9]{64}$/.test(row.tx_hash) ? row.tx_hash : null, message: error instanceof Error ? error.message : "Cannot decode transaction." }); }
  }
  return { records, errors, count: raw.length };
}
