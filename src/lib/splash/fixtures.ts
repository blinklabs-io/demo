import { Core } from "@blaze-cardano/sdk";
import orders from "./mainnet-orders.fixture.json";
export function splashRpcOutput(item: { nativeBytes: string; txoRef: { hash: string; index?: number } }) {
  const bytes = (encoded: string) => Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
  return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(bytes(item.txoRef.hash))), BigInt(item.txoRef.index ?? 0)), Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(bytes(item.nativeBytes))));
}
export function splashFixture(index = 0) { return splashRpcOutput(orders.items[index]); }
