import { Core } from "@blaze-cardano/sdk";

// CIP-30 reports addresses as hex-encoded CBOR bytes; Blockfrost (and humans)
// expect bech32. This is the one place that conversion happens.
export function hexAddressToBech32(hex: string): string {
  return Core.Address.fromBytes(Core.HexBlob(hex)).toBech32();
}
