// Live mempool and chain-tip streaming over UTxO RPC, via @utxorpc/sdk's
// CardanoSubmitClient/CardanoSyncClient rather than Blaze's U5C wrapper -
// Blaze is built for tx construction/submission, not for watching. The SDK
// uses the same browser-safe gRPC-Web transport (@connectrpc/connect-web)
// that @utxorpc/blaze-provider already proves works against Dingo.
import { CardanoSubmitClient, CardanoSyncClient } from "@utxorpc/sdk";
import { Core } from "@blaze-cardano/sdk";
import { DINGO_CONFIG } from "../config";

let submitClient: CardanoSubmitClient | null = null;
let syncClient: CardanoSyncClient | null = null;

export function getMempoolSubmitClient(): CardanoSubmitClient {
  if (!submitClient) {
    submitClient = new CardanoSubmitClient({ uri: DINGO_CONFIG.utxorpcUrl });
  }
  return submitClient;
}

export function getMempoolSyncClient(): CardanoSyncClient {
  if (!syncClient) {
    syncClient = new CardanoSyncClient({ uri: DINGO_CONFIG.utxorpcUrl });
  }
  return syncClient;
}

export interface PendingTx {
  hash: string;
  inputCount: number;
  outputCount: number;
  totalOutputLovelace: bigint;
  fee: bigint;
  seenAt: number;
}

// Dingo's WatchMempool/ReadMempool only ever populate raw tx bytes, never
// the optional parsed-Cardano-tx field UTxO RPC's wire format otherwise
// allows for - so every pending tx has to be CBOR-decoded client-side to
// show anything beyond a hash. Reuses Blaze's own transaction parser rather
// than adding a second CBOR library.
export function decodeMempoolTx(nativeBytes: Uint8Array): PendingTx | null {
  try {
    const hex = Array.from(nativeBytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const tx = Core.Serialization.Transaction.fromCbor(Core.TxCBOR(hex));
    const body = tx.body();
    let totalOutputLovelace = 0n;
    for (const output of body.outputs()) {
      totalOutputLovelace += output.amount().coin();
    }
    return {
      hash: tx.getId(),
      inputCount: body.inputs().size(),
      outputCount: body.outputs().length,
      totalOutputLovelace,
      fee: body.fee(),
      seenAt: Date.now(),
    };
  } catch {
    // A tx type this app's Blaze version doesn't understand (e.g. a very
    // new era feature) shouldn't take down the whole feed.
    return null;
  }
}

// Fetches the current mempool contents as a point-in-time snapshot. Used
// both for the initial view and as periodic reconciliation, since
// WatchMempool only reports arrivals - it never reports a tx leaving the
// mempool (confirmed or evicted), so "no longer in a fresh snapshot" is the
// only reliable removal signal.
export async function readMempoolSnapshot(): Promise<PendingTx[]> {
  const client = getMempoolSubmitClient();
  const response = await client.inner.readMempool({});
  const decoded: PendingTx[] = [];
  for (const item of response.items) {
    const tx = decodeMempoolTx(item.nativeBytes);
    if (tx) {
      decoded.push(tx);
    }
  }
  return decoded;
}
