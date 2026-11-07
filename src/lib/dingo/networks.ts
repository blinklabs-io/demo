export const NETWORK_STORAGE_KEY = "dingo.network";
export const DINGO_NETWORKS = {
  preview: { id: "preview", label: "Preview", networkMagic: 2 },
  preprod: { id: "preprod", label: "Preprod", networkMagic: 1 },
  musashi: { id: "musashi", label: "Musashi", networkMagic: 164 },
} as const;
export type DingoNetworkId = keyof typeof DINGO_NETWORKS;
export function isDingoNetworkId(value: string): value is DingoNetworkId {
  return value === "preview" || value === "preprod" || value === "musashi";
}
export function urlDingoNetwork(search: string): DingoNetworkId | null {
  const values = new URLSearchParams(search).getAll("network");
  if (!values.length) return null;
  if (values.length !== 1 || !isDingoNetworkId(values[0]))
    throw new Error(
      "Choose a valid network in the URL: preview, preprod, or musashi.",
    );
  return values[0];
}
export function networkSearch(search: string, network: DingoNetworkId): string {
  const params = new URLSearchParams(search);
  params.set("network", network);
  return `?${params.toString()}`;
}
export function persistDingoNetwork(network: DingoNetworkId): boolean {
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
    return true;
  } catch {
    // The explicit URL remains authoritative when browser storage is unavailable.
    return false;
  }
}
export function selectedDingoNetwork() {
  const explicit =
    typeof window === "undefined"
      ? null
      : urlDingoNetwork(window.location.search);
  if (explicit !== null) return DINGO_NETWORKS[explicit];
  const value =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(NETWORK_STORAGE_KEY);
  if (value === null) return DINGO_NETWORKS.preview;
  if (!isDingoNetworkId(value))
    throw new Error(
      `Unsupported saved Dingo network "${value}". Clear the saved network selection to continue.`,
    );
  return DINGO_NETWORKS[value];
}

let networkNavigationPending = false;
export function markNetworkNavigationPending() {
  networkNavigationPending = true;
}
export function installNetworkRestoreGuard(): () => void {
  const restore = (event: PageTransitionEvent) => {
    if (event.persisted && networkNavigationPending) window.location.reload();
  };
  window.addEventListener("pageshow", restore);
  return () => window.removeEventListener("pageshow", restore);
}
