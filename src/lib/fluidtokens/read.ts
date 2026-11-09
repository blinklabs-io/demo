import type { Cip30WalletApi } from "../dingo/cip30";
import { Core } from "@blaze-cardano/sdk";
import { DINGO_NETWORK } from "../dingo/config";
import { assertDingoTransactionBackends } from "../dingo/walletSession";
import { getDingoProvider } from "../dingo/utxorpc/provider";
import { hexToBytes } from "../dingo/utxorpc/bytes";
import { decodeFluidPool, decodeFluidConfig, fluidAddress, FLUID_CONFIG_ASSET } from "./data";

export async function assertFluidMainnet() {
  if (DINGO_NETWORK.id !== "mainnet") throw new Error("FluidTokens pools require Cardano Mainnet.");
  await assertDingoTransactionBackends();
}
export function fluidInput(outpoint: string) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 0xffffffff) throw new Error("Enter a transaction hash followed by #output index.");
  return new Core.TransactionInput(Core.TransactionId(match[1]), BigInt(match[2]));
}
export async function readFluidPool(outpoint: string, signal?: AbortSignal) {
  const input = fluidInput(outpoint);
  await assertFluidMainnet(); signal?.throwIfAborted();
  const outputs = await getDingoProvider().resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (outputs.length !== 1 || outputs[0].input().toCbor() !== input.toCbor()) throw new Error("FluidTokens pool is spent or unavailable.");
  return decodeFluidPool(outputs[0]);
}
export async function readFluidPools(owner: string, cancelKeys: readonly string[], cursor = "", signal?: AbortSignal) {
  const address = Core.Address.fromBech32(owner);
  if (address.getNetworkId() !== 1) throw new Error("Use a mainnet account address.");
  if (!cancelKeys.length || cancelKeys.some(key => !/^[a-f0-9]{56}$/.test(key))) throw new Error("Wallet cancellation keys are unavailable.");
  if (cursor.length > 4096) throw new Error("FluidTokens page cursor exceeds the query limit.");
  await assertFluidMainnet(); signal?.throwIfAborted();
  const expectedAddress = fluidAddress(address);
  const response = await getDingoProvider().queryClient.inner.searchUtxos({
    maxItems: 20, startToken: cursor,
    predicate: { match: { utxoPattern: { case: "cardano", value: { address: { exactAddress: hexToBytes(expectedAddress.toBytes()) } } } } },
  }, { signal });
  signal?.throwIfAborted();
  if (response.items.length > 20 || (response.nextToken && response.nextToken === cursor)) throw new Error("Dingo returned an invalid FluidTokens pool page.");
  const pools: ReturnType<typeof decodeFluidPool>[] = [], errors: string[] = [], seen = new Set<string>();
  for (const item of response.items) {
    const ref = item.txoRef;
    if (!ref || ref.hash.length !== 32 || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 0xffffffff) throw new Error("Dingo returned an invalid FluidTokens output reference.");
    const input = new Core.TransactionInput(Core.TransactionId(Core.toHex(ref.hash)), BigInt(ref.index));
    if (seen.has(input.toCbor())) throw new Error("Dingo repeated a FluidTokens output.");
    seen.add(input.toCbor());
    try {
      if (!item.nativeBytes.length || item.nativeBytes.length > 65536) throw new Error("Invalid FluidTokens output CBOR size.");
      const output = Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item.nativeBytes));
      if (output.address().toBytes() !== expectedAddress.toBytes()) throw new Error("FluidTokens output is outside the requested account address.");
      const order = decodeFluidPool(new Core.TransactionUnspentOutput(input, output));
      if (order.authTag === 0n && cancelKeys.includes(order.key)) pools.push(order);
    } catch (cause) { errors.push(cause instanceof Error ? cause.message : "Unsupported FluidTokens output."); }
  }
  return { pools, errors, nextToken: response.nextToken };
}

export async function fluidCancellationKeys(api: Cip30WalletApi) {
  const addresses = [await api.getChangeAddress(), ...await api.getUsedAddresses(), ...await api.getUnusedAddresses()];
  const keys = new Set<string>();
  for (const hex of addresses) {
    const address = Core.Address.fromBytes(Core.HexBlob(hex)), payment = address.getProps().paymentPart;
    if (address.getNetworkId() !== 1) throw new Error("Use a mainnet wallet address.");
    if (payment?.type === Core.CredentialType.KeyHash) keys.add(String(payment.hash));
  }
  return [...keys];
}

export async function readFluidConfig(signal?: AbortSignal) {
  await assertFluidMainnet();
  const response = await getDingoProvider().queryClient.inner.searchUtxos({ maxItems: 2, predicate: { match: { utxoPattern: { case: "cardano", value: { asset: { policyId: hexToBytes(FLUID_CONFIG_ASSET.slice(0,56)), assetName: hexToBytes(FLUID_CONFIG_ASSET.slice(56)) } } } } } }, { signal });
  signal?.throwIfAborted();
  if (response.items.length !== 1 || response.nextToken) throw new Error("Dingo did not identify one FluidTokens configuration output.");
  const row = response.items[0];
  if (!row.txoRef || row.txoRef.hash.length !== 32 || !Number.isInteger(row.txoRef.index) || row.txoRef.index < 0 || row.txoRef.index > 0xffffffff || !row.nativeBytes.length || row.nativeBytes.length > 65536) throw new Error("Invalid FluidTokens configuration output.");
  return decodeFluidConfig(new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(row.txoRef.hash)), BigInt(row.txoRef.index)), Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(row.nativeBytes))));
}
