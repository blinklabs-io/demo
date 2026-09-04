// Powers the global lookup bar: given whatever a visitor pastes in, decide
// what kind of on-chain entity it is and where in the Explorer to send them.
// This is the seam that makes Explorer and Wallet feel like one app rather
// than two - the same detector runs from anywhere in the header.
export type EntityKind =
  | "block"
  | "tx"
  | "address"
  | "account"
  | "asset"
  | "pool"
  | "drep";

export interface LookupResult {
  kind: EntityKind;
  route: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;
// Blockfrost asset IDs are policy_id (56 hex chars) + optional asset_name_hex
// (0-64 hex chars). This overlaps with a raw 28-byte DRep credential hex, but
// DReps are reachable by bech32 id or from the DRep list, so that's an
// acceptable ambiguity for a search-box heuristic.
const ASSET_HEX = /^[0-9a-f]{56,120}$/i;
const NUMERIC = /^\d+$/;

export function detectEntityKind(rawQuery: string): LookupResult | null {
  const query = rawQuery.trim();
  if (!query) {
    return null;
  }

  if (/^(addr|addr_test)1[0-9a-z]+$/i.test(query)) {
    return { kind: "address", route: `/explorer/address/${query}` };
  }
  if (/^(stake|stake_test)1[0-9a-z]+$/i.test(query)) {
    return { kind: "account", route: `/explorer/account/${query}` };
  }
  if (/^pool1[0-9a-z]+$/i.test(query)) {
    return { kind: "pool", route: `/explorer/pool/${query}` };
  }
  if (/^drep1[0-9a-z]+$/i.test(query) || /^drep_script1[0-9a-z]+$/i.test(query)) {
    return { kind: "drep", route: `/explorer/drep/${query}` };
  }
  if (HEX64.test(query)) {
    // A 64-char hex string could be a tx hash or a block hash. The resolver
    // route tries tx first, then falls back to block.
    return { kind: "tx", route: `/explorer/lookup/${query.toLowerCase()}` };
  }
  if (ASSET_HEX.test(query)) {
    return { kind: "asset", route: `/explorer/asset/${query.toLowerCase()}` };
  }
  if (NUMERIC.test(query)) {
    return { kind: "block", route: `/explorer/block/${query}` };
  }
  return null;
}
