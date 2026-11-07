import { Core } from "@blaze-cardano/sdk";
import type { BlockSummary } from "../explorer/recentBlocks";

export interface LeiosObservation {
  hash: string;
  height: number;
  slot: number;
  certified: boolean;
  announcement: { hash: string; bytes: number } | null;
  certificate: {
    signerCount: number;
    bitfieldBytes: number;
    signatureBytes: number;
  } | null;
  rankingTransactions: number;
  nativeBytes: number;
}

function uint(reader: Core.CborReader): number {
  const value = reader.readUInt();
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Leios integer exceeds the display range.");
  return Number(value);
}

export function decodeLeiosBlock(
  bytes: Uint8Array,
  expected: Pick<BlockSummary, "hash" | "height" | "slot">,
): LeiosObservation | null {
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    throw new Error("Invalid native block size.");
  const block = new Core.CborReader(Core.HexBlob.fromBytes(bytes));
  const arity = block.readStartArray();
  if (arity === 4 || arity === 5) return null;
  if (arity !== 2) throw new Error("Unsupported native block envelope.");
  const headerBytes = block.readEncodedValue();
  if (Core.blake2b_256(Core.HexBlob.fromBytes(headerBytes)) !== expected.hash)
    throw new Error(
      "Native header does not match the requested ranking block.",
    );
  const header = new Core.CborReader(Core.HexBlob.fromBytes(headerBytes));
  if (header.readStartArray() !== 2)
    throw new Error("Invalid ranking-block header.");
  const fields = header.readStartArray();
  if (fields !== 10 && fields !== 12)
    throw new Error("Unsupported ranking-block header fields.");
  const height = uint(header),
    slot = uint(header);
  if (height !== expected.height || slot !== expected.slot)
    throw new Error("Ranking-block height or slot does not match its index.");
  for (let i = 2; i < 9; i++) header.skipValue();
  if (header.readStartArray() !== 2)
    throw new Error("Invalid ranking-block protocol version.");
  const major = uint(header);
  uint(header);
  header.readEndArray();
  if (fields === 10) return null;
  if (major < 12) throw new Error("Leios fields require a Dijkstra header.");
  const certified = header.readBoolean();
  let announcement: LeiosObservation["announcement"] = null;
  if (header.peekState() === Core.CborReaderState.Null) header.readNull();
  else {
    if (header.readStartArray() !== 2)
      throw new Error("Invalid endorser-block announcement.");
    const hash = header.readByteString(),
      size = uint(header);
    if (hash.length !== 32 || size > 0xffffffff)
      throw new Error("Invalid announced endorser-block hash or size.");
    header.readEndArray();
    announcement = { hash: Core.toHex(hash), bytes: size };
  }
  header.readEndArray();
  header.readByteString();
  header.readEndArray();
  if (header.getBytesRemaining())
    throw new Error("Trailing ranking-block header bytes.");
  if (block.readStartArray() !== 3)
    throw new Error("Unsupported Dijkstra block body.");
  block.readStartArray();
  let rankingTransactions = 0;
  while (block.peekState() !== Core.CborReaderState.EndArray) {
    block.skipValue();
    rankingTransactions++;
  }
  block.readEndArray();
  let certificate: LeiosObservation["certificate"] = null;
  if (block.peekState() === Core.CborReaderState.Null) block.readNull();
  else {
    if (block.readStartArray() !== 2)
      throw new Error("Invalid Leios certificate.");
    const bitfield = block.readByteString(),
      signature = block.readByteString();
    block.readEndArray();
    if (bitfield.length > 8192 || signature.length !== 48)
      throw new Error(
        "Invalid Leios signer bitfield or aggregate signature size.",
      );
    let signerCount = 0;
    for (const byte of bitfield)
      for (let bit = 0; bit < 8; bit++) signerCount += (byte >> bit) & 1;
    certificate = {
      signerCount,
      bitfieldBytes: bitfield.length,
      signatureBytes: signature.length,
    };
  }
  if (
    certified !== (certificate !== null) ||
    (certified && rankingTransactions > 0)
  )
    throw new Error("Ranking-block certification flag and body disagree.");
  if (block.peekState() === Core.CborReaderState.Null) block.readNull();
  else block.readByteString();
  block.readEndArray();
  block.readEndArray();
  if (block.getBytesRemaining())
    throw new Error("Trailing Dijkstra block bytes.");
  return {
    hash: expected.hash,
    height,
    slot,
    certified,
    announcement,
    certificate,
    rankingTransactions,
    nativeBytes: bytes.length,
  };
}

export function leiosTotals(rows: LeiosObservation[]) {
  return {
    announcements: rows.filter((row) => row.announcement).length,
    certificates: rows.filter((row) => row.certificate).length,
    announcedBytes: rows.reduce(
      (sum, row) => sum + (row.announcement?.bytes ?? 0),
      0,
    ),
  };
}
