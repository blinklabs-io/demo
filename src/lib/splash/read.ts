import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { decodeSplashOrder, splashOrderAddress } from "./data";

export async function assertSplashMainnet() {
  if (DINGO_NETWORK.id !== "mainnet") throw new Error("Splash orders require Cardano Mainnet.");
  await assertDingoTransactionBackends();
}
export function splashInput(outpoint: string) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 0xffffffff) throw new Error("Enter a transaction hash followed by #output index.");
  return new Core.TransactionInput(Core.TransactionId(match[1]), BigInt(match[2]));
}
export async function readSplashOrder(outpoint: string, signal?: AbortSignal) {
  const input = splashInput(outpoint);
  await assertSplashMainnet(); signal?.throwIfAborted();
  const outputs = await getDingoProvider().resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (outputs.length !== 1 || outputs[0].input().toCbor() !== input.toCbor()) throw new Error("Splash order is spent or unavailable.");
  return decodeSplashOrder(outputs[0]);
}
export async function readSplashOrders(owner: string, cursor = "", signal?: AbortSignal) {
  const address = Core.Address.fromBech32(owner);
  if (address.getNetworkId() !== 1) throw new Error("Use a mainnet account address.");
  if (!address.getProps().delegationPart) throw new Error("Account listing requires a stake credential. Load an enterprise order by output reference.");
  if (cursor.length > 4096) throw new Error("Splash page cursor exceeds the query limit.");
  await assertSplashMainnet(); signal?.throwIfAborted();
  const expectedAddress = splashOrderAddress(address);
  const response = await getDingoProvider().queryClient.inner.searchUtxos({
    maxItems: 20, startToken: cursor,
    predicate: { match: { utxoPattern: { case: "cardano", value: { address: { exactAddress: hexToBytes(expectedAddress.toBytes()) } } } } },
  }, { signal });
  signal?.throwIfAborted();
  if (response.items.length > 20 || (response.nextToken && response.nextToken === cursor)) throw new Error("Dingo returned an invalid Splash order page.");
  const orders: ReturnType<typeof decodeSplashOrder>[] = [], errors: string[] = [], seen = new Set<string>();
  for (const item of response.items) {
    const ref = item.txoRef;
    if (!ref || ref.hash.length !== 32 || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 0xffffffff) throw new Error("Dingo returned an invalid Splash output reference.");
    const input = new Core.TransactionInput(Core.TransactionId(Core.toHex(ref.hash)), BigInt(ref.index));
    if (seen.has(input.toCbor())) throw new Error("Dingo repeated a Splash output.");
    seen.add(input.toCbor());
    try {
      if (!item.nativeBytes.length || item.nativeBytes.length > 65536) throw new Error("Invalid Splash output CBOR size.");
      const output = Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item.nativeBytes));
      if (output.address().toBytes() !== expectedAddress.toBytes()) throw new Error("Splash output is outside the requested account address.");
      orders.push(decodeSplashOrder(new Core.TransactionUnspentOutput(input, output)));
    } catch (cause) { errors.push(cause instanceof Error ? cause.message : "Unsupported Splash output."); }
  }
  return { orders, errors, nextToken: response.nextToken };
}
