import { DINGO_NETWORK } from "../dingo/config";

export const REACTOR_DOCS = "https://developers.apexfusion.org/documentation/reactor-bridge-technical-overview";
export type Destination = "vector" | "nexus";
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reactor returned an invalid response.");
  return value as Record<string, unknown>;
};
function units(value: unknown): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Reactor returned invalid AP3X amounts.");
  return BigInt(value);
}
export function assertPrime() {
  if (DINGO_NETWORK.id !== "prime-testnet" || DINGO_NETWORK.networkMagic !== 3311) throw new Error("Reactor requires Prime Testnet.");
}
async function read(resource: string, signal?: AbortSignal, hash?: string) {
  assertPrime();
  const params = new URLSearchParams({ resource });
  if (hash) params.set("hash", hash);
  const response = await fetch(`/reactor?${params}`, { signal, credentials: "omit", cache: "no-store" });
  if (response.status === 404 && resource === "transfer") return null;
  if (!response.ok) throw new Error("Could not read Reactor. Try again.");
  return object(await response.json());
}
export async function readBridgeSettings(signal?: AbortSignal) {
  const [raw, validators] = await Promise.all([read("settings", signal), read("validators", signal)]);
  if (!raw || !validators || typeof validators.inProgress !== "boolean") throw new Error("Reactor returned invalid availability data.");
  const settings = object(raw.bridgingSettings);
  const directions = object(settings.allowedDirections);
  const enabled = Array.isArray(raw.enabledChains) ? raw.enabledChains : [];
  const routes = Array.isArray(directions.prime) ? directions.prime : [];
  const destinations = (["vector", "nexus"] as const).filter((chain) => enabled.includes("prime") && enabled.includes(chain) && routes.includes(chain));
  const minimum = units(settings.minValueToBridge), maximum = units(settings.maxAmountAllowedToBridge);
  const fee = units(object(settings.minChainFeeForBridging).prime);
  if (minimum === 0n || (maximum !== 0n && maximum < minimum)) throw new Error("Reactor returned invalid transfer limits.");
  return { minimum, maximum, fee, destinations, paused: validators.inProgress };
}
export async function readBridgeTransfer(hash: string, signal?: AbortSignal) {
  const normalized = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("Enter a 64-character Prime transaction hash.");
  const raw = await read("transfer", signal, normalized);
  if (!raw) return null;
  if (raw.originChain !== "prime" || raw.sourceTxHash !== normalized || !["vector", "nexus"].includes(String(raw.destinationChain)) || typeof raw.status !== "string" || !raw.status)
    throw new Error("Reactor returned a transfer that does not match this Prime transaction.");
  return { hash: normalized, destination: raw.destinationChain as Destination, status: raw.status, destinationHash: typeof raw.destinationTxHash === "string" ? raw.destinationTxHash : null, isRefund: raw.isRefund === true };
}
