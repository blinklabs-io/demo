import type { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "./dingo/config";

export function nativeTicker() { return DINGO_NETWORK.id === "prime-testnet" ? "AP3X" : "ADA"; }
export function nativeSymbol() { return DINGO_NETWORK.id === "prime-testnet" ? "AP3X" : "₳"; }

// A grouping-only formatter applied to the whole-coin part as a bigint
// (Intl.NumberFormat accepts bigint directly, exactly - no float round-trip).
// The fractional part is derived from string digits of the remainder, so
// this stays exact even for amounts well above Number.MAX_SAFE_INTEGER
// lovelace (e.g. epoch active_stake, network supply figures).
const groupFormatter = new Intl.NumberFormat("en-US");

function formatCoin(lovelace: bigint | number, ticker: string): string {
  const value =
    typeof lovelace === "bigint" ? lovelace : BigInt(Math.trunc(lovelace));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const remainder = abs % 1_000_000n;

  let fraction = remainder.toString().padStart(6, "0").replace(/0+$/, "");
  if (fraction.length < 2) {
    fraction = fraction.padEnd(2, "0");
  }

  return `${negative ? "-" : ""}${groupFormatter.format(whole)}.${fraction} ${ticker}`;
}

export function formatAda(value: bigint | number) { return formatCoin(value, "ADA"); }
export function formatNativeCoin(value: bigint | number) { return formatCoin(value, nativeTicker()); }

export function shortenHash(hash: string, visible = 8): string {
  if (hash.length <= visible * 2 + 3) {
    return hash;
  }
  return `${hash.slice(0, visible)}...${hash.slice(-visible)}`;
}

export function formatAddress(address: Core.Address): string {
  return address.asByron() ? address.toBase58() : address.toBech32();
}
