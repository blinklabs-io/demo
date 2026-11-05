export const NETWORK_STORAGE_KEY = "dingo.network";
export const DINGO_NETWORKS = {
  preview: { id: "preview", label: "Preview", networkMagic: 2 },
  preprod: { id: "preprod", label: "Preprod", networkMagic: 1 },
} as const;
export type DingoNetworkId = keyof typeof DINGO_NETWORKS;
export function isDingoNetworkId(value: string): value is DingoNetworkId {
  return value === "preview" || value === "preprod";
}
export function urlDingoNetwork(search: string): DingoNetworkId | null {
  const values = new URLSearchParams(search).getAll("network");
  if (!values.length) return null;
  if (values.length !== 1 || !isDingoNetworkId(values[0]))
    throw new Error("Choose a valid network in the URL: preview or preprod.");
  return values[0];
}
export function networkSearch(search: string, network: DingoNetworkId): string {
  const params = new URLSearchParams(search);
  params.set("network", network);
  return `?${params.toString()}`;
}
export function selectedDingoNetwork() {
  const explicit = typeof window === "undefined" ? null : urlDingoNetwork(window.location.search);
  if (explicit !== null) return DINGO_NETWORKS[explicit];
  const value = typeof window === "undefined" ? null : window.localStorage.getItem(NETWORK_STORAGE_KEY);
  if (value === null) return DINGO_NETWORKS.preview;
  if (!isDingoNetworkId(value))
    throw new Error(`Unsupported saved Dingo network "${value}". Clear the saved network selection to continue.`);
  return DINGO_NETWORKS[value];
}
