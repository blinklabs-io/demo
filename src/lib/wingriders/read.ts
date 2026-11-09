import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes, bytesToHex } from "../dingo/utxorpc/bytes";
import { decodeRapidPool, RAPID_POOL_HASH, RAPID_MARKER } from "./data";
export async function assertRapidMainnet() {
  if (DINGO_NETWORK.id !== "mainnet")
    throw new Error("WingRiders Rapid requires Cardano Mainnet.");
  await assertDingoTransactionBackends();
}
type RpcOutput = {
  txoRef?: { hash: Uint8Array; index: number };
  nativeBytes: Uint8Array;
};
function decodeOutput(item: RpcOutput) {
  if (
    !item.txoRef ||
    item.txoRef.hash.length !== 32 ||
    !Number.isSafeInteger(item.txoRef.index) ||
    item.txoRef.index < 0 ||
    !item.nativeBytes.length ||
    item.nativeBytes.length > 65536
  )
    throw new Error("Dingo returned an invalid WingRiders Rapid output.");
  return new Core.TransactionUnspentOutput(
    new Core.TransactionInput(
      Core.TransactionId(bytesToHex(item.txoRef.hash)),
      BigInt(item.txoRef.index),
    ),
    Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item.nativeBytes)),
  );
}
async function markerPage(cursor: string, signal?: AbortSignal) {
  if (cursor.length > 4096)
    throw new Error("WingRiders Rapid page cursor exceeds the query limit.");
  const response = await getDingoProvider().queryClient.inner.searchUtxos(
    {
      predicate: {
        match: {
          utxoPattern: {
            case: "cardano",
            value: {
              asset: {
                policyId: hexToBytes(RAPID_POOL_HASH),
                assetName: hexToBytes(RAPID_MARKER.slice(56)),
              },
              address: { paymentPart: hexToBytes(RAPID_POOL_HASH) },
            },
          },
        },
      },
      maxItems: 20,
      startToken: cursor,
    },
    { signal },
  );
  if (
    response.items.length > 20 ||
    (response.nextToken && response.nextToken === cursor)
  )
    throw new Error("Dingo returned an invalid WingRiders Rapid page.");
  return response;
}
export async function readRapidPools(cursor = "", signal?: AbortSignal) {
  await assertRapidMainnet();
  const response = await markerPage(cursor, signal),
    pools: ReturnType<typeof decodeRapidPool>[] = [],
    errors: string[] = [];
  for (const item of response.items) {
    try {
      pools.push(decodeRapidPool(decodeOutput(item)));
    } catch (cause) {
      errors.push(
        cause instanceof Error
          ? cause.message
          : "Invalid WingRiders Rapid pool output.",
      );
    }
  }
  if (new Set(pools.map((pool) => pool.name)).size !== pools.length)
    throw new Error("Dingo returned competing WingRiders Rapid pool states.");
  return { pools, errors, nextToken: response.nextToken };
}
export async function readRapidPool(name: string, signal?: AbortSignal) {
  if (!/^[0-9a-f]{64}$/.test(name))
    throw new Error("Enter a 32-byte WingRiders Rapid pool identifier.");
  await assertRapidMainnet();
  const cursors = new Set<string>();
  const seen = new Set<string>();
  let cursor = "",
    found: ReturnType<typeof decodeRapidPool> | undefined;
  for (let index = 0; index < 5; index++) {
    const response = await markerPage(cursor, signal);
    for (const item of response.items) {
      let pool: ReturnType<typeof decodeRapidPool>;
      try {
        pool = decodeRapidPool(decodeOutput(item));
      } catch {
        continue;
      }
      const reference = pool.utxo.input().toCbor();
      if (seen.has(reference))
        throw new Error("Dingo repeated a WingRiders Rapid pool output.");
      seen.add(reference);
      if (pool.name === name) {
        if (found)
          throw new Error(
            "Dingo returned competing WingRiders Rapid pool states.",
          );
        found = pool;
      }
    }
    if (!response.nextToken) {
      if (!found)
        throw new Error(
          "The WingRiders Rapid pool is missing. Refresh its state.",
        );
      return found;
    }
    if (cursors.has(response.nextToken))
      throw new Error("Dingo repeated a WingRiders Rapid page cursor.");
    cursors.add(response.nextToken);
    cursor = response.nextToken;
  }
  throw new Error(
    "WingRiders Rapid lookup exceeded five bounded pool pages. Refresh the catalog.",
  );
}
