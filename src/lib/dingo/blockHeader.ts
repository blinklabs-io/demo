import { Core } from "@blaze-cardano/sdk";
import { bytesToHex } from "./utxorpc/bytes";
import { getSyncClient } from "./utxorpc/streaming";

export interface HeaderVersion {
  major: string;
  minor: string;
}

export function decodeHeaderVersion(bytes: Uint8Array): HeaderVersion {
  const reader = new Core.CborReader(Core.HexBlob(bytesToHex(bytes)));
  const blockLength = reader.readStartArray();
  if (blockLength !== 4 && blockLength !== 5)
    throw new Error("Unsupported block encoding");
  if (reader.readStartArray() !== 2) throw new Error("Invalid block header");
  const headerLength = reader.readStartArray();
  if (headerLength === 10) {
    for (let i = 0; i < 9; i++) reader.skipValue();
    if (reader.readStartArray() !== 2)
      throw new Error("Invalid header version");
  } else if (headerLength === 15) {
    for (let i = 0; i < 13; i++) reader.skipValue();
  } else {
    throw new Error("Unsupported header format");
  }
  const major = reader.readUInt().toString();
  const minor = reader.readUInt().toString();
  return { major, minor };
}

export async function readHeaderVersion(
  hash: string,
  slot: number,
): Promise<HeaderVersion> {
  const block = await getSyncClient().fetchBlock({ hash, slot });
  if (!block?.nativeBytes?.length)
    throw new Error("Block header bytes unavailable");
  if (bytesToHex(block.parsedBlock.header?.hash ?? new Uint8Array()) !== hash)
    throw new Error("Returned block does not match the requested hash");
  return decodeHeaderVersion(block.nativeBytes);
}
