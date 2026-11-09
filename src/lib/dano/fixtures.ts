import { Core } from "@blaze-cardano/sdk";
import pools from "./pools.fixture.json";
import configs from "./config.fixture.json";
export function danoFixture(row = pools.items[13]) {
  const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(bytes(row.txoRef.hash))), BigInt(row.txoRef.index)), Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(bytes(row.nativeBytes))));
}
export const danoConfigFixture = () => danoFixture(configs.items[0]);
