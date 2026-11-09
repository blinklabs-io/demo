import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes, bytesToHex } from "../dingo/utxorpc/bytes";
import { decodeDanoPool, decodeDanoConfig, DANO_HASH, DANO_CONFIG_NFT } from "./data";
export async function assertDanoMainnet() {
  if (DINGO_NETWORK.id !== "mainnet")
    throw new Error("Dano CLMM requires Cardano Mainnet.");
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
    throw new Error("Dingo returned an invalid Dano CLMM output.");
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
    throw new Error("Dano CLMM page cursor exceeds the query limit.");
  const response = await getDingoProvider().queryClient.inner.searchUtxos(
    {
      predicate: {
        match: {
          utxoPattern: {
            case: "cardano",
            value: {
              address: { exactAddress: hexToBytes(Core.addressFromCredential(1, Core.Credential.fromCore({ type: Core.CredentialType.ScriptHash, hash: Core.Hash28ByteBase16(DANO_HASH) })).toBytes()) },
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
    throw new Error("Dingo returned an invalid Dano CLMM page.");
  return response;
}
export async function readDanoPools(cursor = "", signal?: AbortSignal) {
  await assertDanoMainnet();
  const response = await markerPage(cursor, signal),
    pools: ReturnType<typeof decodeDanoPool>[] = [],
    errors: string[] = [];
  for (const item of response.items) {
    try {
      pools.push(decodeDanoPool(decodeOutput(item)));
    } catch (cause) {
      errors.push(
        cause instanceof Error
          ? cause.message
          : "Invalid Dano CLMM pool output.",
      );
    }
  }
  if (new Set(pools.map((pool) => pool.name)).size !== pools.length || new Set(pools.map((pool) => pool.utxo.input().toCbor())).size !== pools.length)
    throw new Error("Dingo returned competing Dano CLMM pool states.");
  return { pools, errors, nextToken: response.nextToken };
}
export function danoOutpoint(pool: ReturnType<typeof decodeDanoPool>) {
  return `${pool.utxo.input().transactionId()}#${pool.utxo.input().index()}`;
}
export async function readDanoPool(outpoint: string, signal?: AbortSignal) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 0xffffffff)
    throw new Error("Enter a pool transaction hash followed by #output index.");
  await assertDanoMainnet();
  signal?.throwIfAborted();
  const input = new Core.TransactionInput(Core.TransactionId(match[1]), BigInt(match[2]));
  const outputs = await getDingoProvider().resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (outputs.length !== 1 || outputs[0].input().toCbor() !== input.toCbor())
    throw new Error("The Dano CLMM pool output is spent or unavailable. Refresh its state.");
  return decodeDanoPool(outputs[0]);
}

export async function readDanoConfig(signal?: AbortSignal) {
  await assertDanoMainnet();
  const result = await getDingoProvider().queryClient.inner.searchUtxos({ maxItems: 2, predicate: { match: { utxoPattern: { case: "cardano", value: { asset: { policyId: hexToBytes(DANO_CONFIG_NFT.slice(0,56)), assetName: hexToBytes(DANO_CONFIG_NFT.slice(56)) } } } } } }, { signal });
  signal?.throwIfAborted();
  if (result.items.length !== 1 || result.nextToken) throw new Error("Dingo did not identify one Dano configuration output.");
  return decodeDanoConfig(decodeOutput(result.items[0]));
}
