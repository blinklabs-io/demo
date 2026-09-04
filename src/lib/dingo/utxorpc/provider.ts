// Adapted from dingo-sundae-preview/src/dingo/provider.ts. Provides a Blaze
// U5C provider (UTxO RPC over Connect/gRPC-Web) pointed at the configured
// Dingo instance, plus the asset-search compatibility shim Dingo's UTxO RPC
// implementation needs.
import { Core } from "@blaze-cardano/sdk";
import { U5C } from "@utxorpc/blaze-provider";
import { DINGO_CONFIG } from "../config";
import { bytesToHex, hexToBytes } from "./bytes";
import type { DingoQueryClient, UtxoRpcBytes } from "./utxorpcTypes";

const MAX_SUMMARY_UTXOS = 200;

// Preview network magic. Dingo reports this from the Shelley genesis it
// loaded, so it's the authoritative answer for which chain the endpoint is
// serving - see assertDingoNetwork below.
const PREVIEW_NETWORK_MAGIC = 2;

let cachedProvider: U5C | null = null;

export function getDingoProvider(): U5C {
  if (cachedProvider) {
    return cachedProvider;
  }
  const provider = new U5C({
    url: DINGO_CONFIG.utxorpcUrl,
    network: Core.NetworkId.Testnet,
  });
  // U5C derives its internal networkName from the NetworkId above, which
  // resolves any non-mainnet id to "cardano-preprod" - wrong for Preview,
  // and silently wrong: @sundaeswap/core resolves its datum builder and
  // slot/time config from this string, not from genesis data.
  provider.networkName = "cardano-preview";
  installDingoAssetSearchCompatibility(provider);
  cachedProvider = provider;
  return provider;
}

// assertDingoNetwork confirms the endpoint really serves Preview before the
// app builds transactions against Preview-only assumptions (e.g. Sundae V3
// script hashes hardcoded for Preview). Without this, a provider URL pointed
// at another network silently produces unusable - or on a live network,
// dangerous - transactions.
export async function assertDingoNetwork(provider: U5C): Promise<string> {
  const genesis = await queryClientFor(provider).readGenesis();
  if (genesis.networkMagic !== PREVIEW_NETWORK_MAGIC) {
    throw new Error(
      `Dingo reports network magic ${genesis.networkMagic}; this app requires Preview (${PREVIEW_NETWORK_MAGIC}).`,
    );
  }
  return `Preview genesis confirmed (network magic ${genesis.networkMagic}, ${genesis.networkId})`;
}

export type DingoUtxoSummary = {
  lovelace: bigint;
  utxoCount: number;
  truncated: boolean;
};

// summarizeDingoAddress reports what Dingo holds for one complete address.
// Dingo compares the full serialized address bytes, so a base address does
// not pick up enterprise UTxOs that only share its payment credential.
export async function summarizeDingoAddress(
  provider: U5C,
  address: Core.Address,
): Promise<DingoUtxoSummary> {
  return summarizeResolvedUtxos(
    await provider.getUnspentOutputs(address),
    false,
  );
}

// summarizeDingoStakeCredential reports every UTxO whose address delegates to
// the given stake credential, across all address forms that share it. This is
// the closest view UTxO RPC offers of a stake address; live delegation,
// rewards, and pool assignment are node-to-client LocalStateQuery only.
export async function summarizeDingoStakeCredential(
  provider: U5C,
  stakeCredentialHash: string,
): Promise<DingoUtxoSummary> {
  const rpcUtxos = await queryClientFor(provider).searchUtxosByDelegationPart(
    hexToBytes(stakeCredentialHash),
  );
  const truncated = rpcUtxos.length > MAX_SUMMARY_UTXOS;
  const references = rpcUtxos
    .slice(0, MAX_SUMMARY_UTXOS)
    .map(
      (utxo) =>
        new Core.TransactionInput(
          Core.TransactionId(bytesToHex(utxo.txoRef.hash)),
          BigInt(utxo.txoRef.index),
        ),
    );
  if (references.length === 0) {
    return { lovelace: 0n, utxoCount: 0, truncated };
  }

  return summarizeResolvedUtxos(
    await provider.resolveUnspentOutputs(references),
    truncated,
  );
}

export function stakeCredentialHashFor(
  address: Core.Address,
): string | undefined {
  return address.getProps().delegationPart?.hash;
}

function summarizeResolvedUtxos(
  utxos: Core.TransactionUnspentOutput[],
  truncated: boolean,
): DingoUtxoSummary {
  let lovelace = 0n;
  for (const utxo of utxos) {
    lovelace += utxo.output().amount().coin();
  }
  return { lovelace, utxoCount: utxos.length, truncated };
}

type QueryClientHost = {
  queryClient?: DingoQueryClient;
};

type SearchByAsset = DingoQueryClient["searchUtxosByAsset"];
type SearchByAddressWithAsset = DingoQueryClient["searchUtxosByAddressWithAsset"];
type AssetPattern =
  | { kind: "coin" }
  | { kind: "native"; policyId: UtxoRpcBytes; assetName?: UtxoRpcBytes };

const POLICY_ID_BYTES = 28;
const MAX_ASSET_NAME_BYTES = 32;

function queryClientFor(provider: U5C): DingoQueryClient {
  const queryClient = (provider as unknown as QueryClientHost).queryClient;
  if (!queryClient) {
    throw new Error("Blaze U5C query client is not available.");
  }
  return queryClient;
}

function installDingoAssetSearchCompatibility(provider: U5C): void {
  const queryClient = (provider as unknown as QueryClientHost).queryClient;
  if (!queryClient) {
    return;
  }

  const searchUtxosByAsset = queryClient.searchUtxosByAsset.bind(queryClient);
  const searchUtxosByAddress =
    queryClient.searchUtxosByAddress.bind(queryClient);
  const searchUtxosByAddressWithAsset =
    queryClient.searchUtxosByAddressWithAsset.bind(queryClient);

  queryClient.searchUtxosByAsset = ((policyId, name) => {
    const asset = normalizeAssetPattern(policyId, name);
    if (asset.kind === "coin") {
      throw new Error(
        "Cannot search ADA as a native asset. Use address UTxO search for lovelace.",
      );
    }
    return searchUtxosByAsset(asset.policyId, asset.assetName);
  }) as SearchByAsset;

  queryClient.searchUtxosByAddressWithAsset = ((address, policyId, name) => {
    const asset = normalizeAssetPattern(policyId, name);
    if (asset.kind === "coin") {
      return searchUtxosByAddress(address as UtxoRpcBytes);
    }
    return searchUtxosByAddressWithAsset(address, asset.policyId, asset.assetName);
  }) as SearchByAddressWithAsset;
}

function normalizeAssetPattern(
  policyId?: UtxoRpcBytes,
  name?: UtxoRpcBytes,
): AssetPattern {
  if (policyId && policyId.length > 0) {
    if (policyId.length !== POLICY_ID_BYTES) {
      throw new Error(`Native asset policy ID must be ${POLICY_ID_BYTES} bytes.`);
    }
    if (name && name.length > MAX_ASSET_NAME_BYTES) {
      throw new Error(`Native asset name must be at most ${MAX_ASSET_NAME_BYTES} bytes.`);
    }
    return { kind: "native", policyId, assetName: name };
  }

  if (!name || name.length === 0) {
    return { kind: "coin" };
  }
  if (name.length < POLICY_ID_BYTES) {
    throw new Error(`Native asset ID must include a ${POLICY_ID_BYTES}-byte policy ID.`);
  }
  if (name.length > POLICY_ID_BYTES + MAX_ASSET_NAME_BYTES) {
    throw new Error(
      `Native asset ID must be at most ${POLICY_ID_BYTES + MAX_ASSET_NAME_BYTES} bytes.`,
    );
  }

  return {
    kind: "native",
    policyId: name.slice(0, POLICY_ID_BYTES),
    assetName: name.slice(POLICY_ID_BYTES),
  };
}
