// Ported verbatim from dingo-sundae-preview/src/sundae/assets.ts.
import { ADA_METADATA, type IPoolDataAsset } from "@sundaeswap/core";

export type AssetHint = {
  label?: string;
  decimals?: number;
};

export function assetIdFromTuple(tuple: [string, string]): string {
  const [policyId, assetName] = tuple;
  if (policyId === "" && assetName === "") {
    return ADA_METADATA.assetId;
  }
  return `${policyId}.${assetName}`;
}

export function unitFromAssetId(assetId: string): string {
  return assetId === ADA_METADATA.assetId ? "lovelace" : assetId.replace(".", "");
}

export function metadataFor(assetId: string, hint?: AssetHint): IPoolDataAsset {
  if (assetId === ADA_METADATA.assetId) {
    return ADA_METADATA;
  }

  return {
    assetId,
    decimals: hint?.decimals,
    ticker: hint?.label ?? printableAssetName(assetId),
  } as IPoolDataAsset;
}

export function formatAssetAmount(amount: bigint, decimals = 0): string {
  const sign = amount < 0n ? "-" : "";
  const absAmount = amount < 0n ? -amount : amount;

  if (decimals === 0) {
    return `${sign}${absAmount}`;
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = absAmount / divisor;
  const fraction = (absAmount % divisor).toString().padStart(decimals, "0");
  return `${sign}${whole}.${fraction.replace(/0+$/, "") || "0"}`;
}

function printableAssetName(assetId: string): string | undefined {
  const assetName = assetId.includes(".") ? assetId.split(".")[1] : assetId.slice(56);
  if (!assetName || assetName.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(assetName)) {
    return undefined;
  }

  const bytes = assetName.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  if (bytes.length === 0 || bytes.some((byte) => byte < 0x20 || byte > 0x7e)) {
    return undefined;
  }

  return String.fromCharCode(...bytes);
}
