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
    item.txoRef.index > 0xffffffff ||
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
  if (new Set(pools.map((pool) => pool.name)).size !== pools.length || new Set(pools.map((pool) => pool.utxo.input().toCbor())).size !== pools.length)
    throw new Error("Dingo returned competing WingRiders Rapid pool states.");
  return { pools, errors, nextToken: response.nextToken };
}
export function rapidOutpoint(pool: ReturnType<typeof decodeRapidPool>) {
  return `${pool.utxo.input().transactionId()}#${pool.utxo.input().index()}`;
}
export async function readRapidPool(outpoint: string, signal?: AbortSignal) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 0xffffffff)
    throw new Error("Enter a pool transaction hash followed by #output index.");
  await assertRapidMainnet();
  signal?.throwIfAborted();
  const input = new Core.TransactionInput(Core.TransactionId(match[1]), BigInt(match[2]));
  const outputs = await getDingoProvider().resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (outputs.length !== 1 || outputs[0].input().toCbor() !== input.toCbor())
    throw new Error("The WingRiders Rapid pool output is spent or unavailable. Refresh its state.");
  return decodeRapidPool(outputs[0]);
}
