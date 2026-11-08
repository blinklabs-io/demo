import { Core } from "@blaze-cardano/sdk";
import { parseNativeToLovelace } from "../dingo/amount";
import { assertPrime, type Destination, type readBridgeSettings } from "./api";

export const PRIME_BRIDGE_ADDRESS = "addr_test1wr44r7qudqwrpsgfs3m4t47x7xmw55dk4k96faak0w4aeqqxxwlvt";
export type BridgeSettings = Awaited<ReturnType<typeof readBridgeSettings>>;
export type BridgeAction = { destination: Destination; address: string; amount: string };
function chunks(value: string) {
  return value.match(/.{1,40}/g) ?? [];
}
export function bridgePlan(action: BridgeAction, sender: string, settings: BridgeSettings) {
  assertPrime();
  if (settings.paused || !settings.destinations.includes(action.destination)) throw new Error("This Reactor route is not available. Refresh the bridge settings.");
  const amount = parseNativeToLovelace(action.amount);
  if (amount < settings.minimum || (settings.maximum > 0n && amount > settings.maximum)) throw new Error("Enter an amount within Reactor’s current transfer limits.");
  if (amount <= 0n || settings.fee < 0n || amount + settings.fee > 18446744073709551615n) throw new Error("Invalid bridge amount.");
  const from = Core.Address.fromBech32(sender);
  if (from.getNetworkId() !== 0 || from.getProps().paymentPart?.type !== Core.CredentialType.KeyHash) throw new Error("Use a Prime Testnet payment wallet.");
  let address = action.address.trim();
  if (action.destination === "nexus") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/i.test(address)) throw new Error("Enter a nonzero Nexus Testnet EVM address.");
    address = address.toLowerCase();
  } else {
    let parsed: Core.Address;
    try { parsed = Core.Address.fromBech32(address); } catch { throw new Error("Enter a Vector Testnet payment address beginning with addr1."); }
    // Vector Testnet uses Cardano network ID 1; Prime Testnet uses ID 0.
    if (!parsed.toBech32().startsWith("addr1") || parsed.getNetworkId() !== 1 || parsed.getProps().paymentPart?.type !== Core.CredentialType.KeyHash)
      throw new Error("Enter a Vector Testnet payment address beginning with addr1.");
    address = parsed.toBech32();
  }
  const payload = new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
    ["d", action.destination], ["fa", settings.fee], ["s", chunks(sender)], ["t", "bridge"],
    ["tx", [new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
      ["a", chunks(action.destination === "nexus" ? address.slice(2) : address)], ["m", amount],
    ])]],
  ]);
  return {
    address, amount, fee: settings.fee,
    output: new Core.TransactionOutput(Core.Address.fromBech32(PRIME_BRIDGE_ADDRESS), new Core.Value(amount + settings.fee)),
    metadata: Core.Metadata.fromCore(new Map([[1n, payload]])),
  };
}
