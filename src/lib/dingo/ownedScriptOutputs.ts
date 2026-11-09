import { Core } from "@blaze-cardano/sdk";
import { blake2b } from "blakejs";
import type { Cip30WalletApi } from "./cip30";
import { hexToBytes } from "./utxorpc/bytes";
import { getDingoProvider } from "./utxorpc/provider";

export type WalletScriptIdentity = { keys: readonly string[]; addresses: readonly string[] };
export async function walletScriptIdentity(api: Cip30WalletApi, expectedOwner: string): Promise<WalletScriptIdentity> {
  if (await api.getNetworkId() !== 1) throw new Error("Use a mainnet wallet.");
  const change = Core.Address.fromBytes(Core.HexBlob(await api.getChangeAddress()));
  if (change.toBytes() !== Core.Address.fromBech32(expectedOwner).toBytes()) throw new Error("Wallet account changed. Refresh the account.");
  const addresses = [change.toBytes(), ...await api.getUsedAddresses(), ...await api.getUnusedAddresses()];
  const keys = new Set<string>(), canonical = new Set<string>();
  for (const hex of addresses) {
    const address = Core.Address.fromBytes(Core.HexBlob(hex)), payment = address.getProps().paymentPart;
    if (address.getNetworkId() !== 1) throw new Error("Use a mainnet wallet address.");
    canonical.add(address.toBytes());
    if (payment?.type === Core.CredentialType.KeyHash) keys.add(String(payment.hash));
  }
  if (!keys.size) throw new Error("Wallet payment keys are unavailable.");
  return { keys: [...keys], addresses: [...canonical] };
}
export function parseOutpoint(outpoint: string) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 0xffffffff) throw new Error("Enter a transaction hash followed by #output index.");
  return new Core.TransactionInput(Core.TransactionId(match[1]), BigInt(match[2]));
}
export async function readScriptOutpoint(input: Core.TransactionInput, label: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const outputs = await getDingoProvider().resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (outputs.length !== 1 || outputs[0].input().toCbor() !== input.toCbor()) throw new Error(`${label} is spent or unavailable.`);
  return outputs[0];
}
type RpcOutput = { txoRef?: { hash: Uint8Array; index: number }; nativeBytes: Uint8Array };
export function decodeRpcOutput(item: RpcOutput) {
  const ref = item.txoRef;
  if (!ref || ref.hash.length !== 32 || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 0xffffffff) throw new Error("Dingo returned an invalid script output reference.");
  if (!item.nativeBytes.length || item.nativeBytes.length > 65536) throw new Error("Invalid script output CBOR size.");
  return new Core.TransactionUnspentOutput(new Core.TransactionInput(Core.TransactionId(Core.toHex(ref.hash)), BigInt(ref.index)), Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(item.nativeBytes)));
}
export async function readOwnedScriptPage<T>(identity: WalletScriptIdentity, target: (owner: Core.Address) => Core.Address, decode: (utxo: Core.TransactionUnspentOutput, keys: readonly string[]) => T | undefined, cursor = "", signal?: AbortSignal) {
  if (!identity.keys.length || identity.keys.some(key => !/^[a-f0-9]{56}$/.test(key))) throw new Error("Wallet cancellation keys are unavailable.");
  if (!identity.addresses.length) throw new Error("Wallet addresses are unavailable.");
  const addresses = [...new Set(identity.addresses.map(hex => {
    const owner = Core.Address.fromBytes(Core.HexBlob(hex));
    if (owner.getNetworkId() !== 1) throw new Error("Use a mainnet account address.");
    const address = target(owner);
    if (address.getNetworkId() !== 1) throw new Error("Use a mainnet script address.");
    return String(address.toBytes());
  }))].sort();
  const fingerprint = Core.toHex(blake2b(new TextEncoder().encode(JSON.stringify([addresses, [...identity.keys].sort()])), undefined, 16));
  if (cursor.length > 4096) throw new Error("Wallet page cursor exceeds the query limit.");
  let account = 0, token = "";
  if (cursor) {
    let page: unknown;
    try { page = JSON.parse(cursor); } catch { throw new Error("Invalid wallet page cursor. Refresh the account."); }
    if (!page || typeof page !== "object" || !("version" in page) || page.version !== 1 || !("fingerprint" in page) || page.fingerprint !== fingerprint || !("account" in page) || typeof page.account !== "number" || !Number.isSafeInteger(page.account) || page.account < 0 || page.account >= addresses.length || !("token" in page) || typeof page.token !== "string") throw new Error("Wallet addresses or page cursor changed. Refresh the account.");
    account = page.account; token = page.token;
  }
  const response = await getDingoProvider().queryClient.inner.searchUtxos({ maxItems: 20, startToken: token, predicate: { match: { utxoPattern: { case: "cardano", value: { address: { exactAddress: hexToBytes(addresses[account]) } } } } } }, { signal });
  signal?.throwIfAborted();
  if (response.items.length > 20 || (response.nextToken && response.nextToken === token)) throw new Error("Dingo returned an invalid script-output page.");
  const records: T[] = [], errors: string[] = [], seen = new Set<string>();
  for (const item of response.items) {
    const ref = item.txoRef;
    if (!ref || ref.hash.length !== 32 || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 0xffffffff) throw new Error("Dingo returned an invalid script output reference.");
    const id = `${Core.toHex(ref.hash)}#${ref.index}`;
    if (seen.has(id)) throw new Error("Dingo repeated a script output.");
    seen.add(id);
    try {
      const utxo = decodeRpcOutput(item);
      if (utxo.output().address().toBytes() !== addresses[account]) throw new Error("Dingo output is outside the requested wallet script address.");
      const record = decode(utxo, identity.keys);
      if (record !== undefined) records.push(record);
    } catch (error) { errors.push(error instanceof Error ? error.message : "Unsupported script output."); }
  }
  let nextToken = "";
  if (response.nextToken || account + 1 < addresses.length) {
    nextToken = JSON.stringify({ version: 1, fingerprint, account: response.nextToken ? account : account + 1, token: response.nextToken || "" });
    if (nextToken.length > 4096) throw new Error("Wallet page cursor exceeds the query limit.");
  }
  return { records, errors, nextToken };
}
