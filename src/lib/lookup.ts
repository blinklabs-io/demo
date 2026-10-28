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
  | "policy"
  | "pool"
  | "drep"
  | "metadata"
  | "epoch"
  | "handle";

export interface LookupResult {
  kind: EntityKind;
  route: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const POLICY_HEX = /^[0-9a-f]{56}$/i;
const ASSET_HEX = /^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/i;
const NUMERIC = /^\d+$/;

export function detectEntityKind(rawQuery: string): LookupResult | null {
  const query = rawQuery.trim();
  if (!query) {
    return null;
  }

  if (/^\$[a-z0-9_.@-]+$/i.test(query)) {
    return {
      kind: "handle",
      route: `/explorer/handle/${encodeURIComponent(query.slice(1).toLowerCase())}`,
    };
  }
  const explicitTicker = /^pool:([a-z0-9]{1,5})$/i.exec(query);
  if (explicitTicker)
    return {
      kind: "pool",
      route: `/explorer/pools?ticker=${explicitTicker[1].toUpperCase()}`,
    };

  if (/^(addr|addr_test)1[0-9a-z]+$/i.test(query)) {
    return { kind: "address", route: `/explorer/address/${query}` };
  }
  if (/^(stake|stake_test)1[0-9a-z]+$/i.test(query)) {
    return { kind: "account", route: `/explorer/account/${query}` };
  }
  if (/^pool1[0-9a-z]+$/i.test(query)) {
    return { kind: "pool", route: `/explorer/pool/${query}` };
  }
  if (
    /^drep1[0-9a-z]+$/i.test(query) ||
    /^drep_script1[0-9a-z]+$/i.test(query)
  ) {
    return { kind: "drep", route: `/explorer/drep/${query}` };
  }
  const metadataLabel = /^metadata:(\d+)$/i.exec(query);
  if (metadataLabel) {
    return {
      kind: "metadata",
      route: `/explorer/metadata/${metadataLabel[1]}`,
    };
  }
  const epochNumber = /^epoch:(\d+)$/i.exec(query);
  if (epochNumber) {
    return { kind: "epoch", route: `/explorer/epoch/${epochNumber[1]}` };
  }
  const drepCredential = /^drep:([0-9a-f]{56})$/i.exec(query);
  if (drepCredential) {
    return {
      kind: "drep",
      route: `/explorer/drep/${drepCredential[1].toLowerCase()}`,
    };
  }
  const explicitPolicy = /^policy:([0-9a-f]{56})$/i.exec(query);
  if (explicitPolicy)
    return {
      kind: "policy",
      route: `/explorer/policy/${explicitPolicy[1].toLowerCase()}`,
    };
  const explicitAsset = /^asset:(.+)$/i.exec(query);
  const assetQuery = explicitAsset ? explicitAsset[1] : query;
  const dottedAsset = /^([0-9a-f]{56})\.((?:[0-9a-f]{2}){0,32})$/i.exec(
    assetQuery,
  );
  if (dottedAsset)
    return {
      kind: "asset",
      route: `/explorer/asset/${(dottedAsset[1] + dottedAsset[2]).toLowerCase()}`,
    };
  if (explicitAsset)
    return ASSET_HEX.test(assetQuery)
      ? { kind: "asset", route: `/explorer/asset/${assetQuery.toLowerCase()}` }
      : null;
  if (POLICY_HEX.test(query))
    return { kind: "policy", route: `/explorer/policy/${query.toLowerCase()}` };
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
  if (/^[a-z0-9]{1,5}$/i.test(query))
    return {
      kind: "pool",
      route: `/explorer/pools?ticker=${query.toUpperCase()}`,
    };
  return null;
}
