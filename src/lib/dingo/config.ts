import { selectedDingoNetwork } from "./networks";

export const DINGO_NETWORK = Object.freeze(selectedDingoNetwork());
const endpoints = {
  mainnet: {
    blockfrostUrl: import.meta.env.VITE_DINGO_MAINNET_BLOCKFROST_URL || "https://dingo.mainnet.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_MAINNET_UTXORPC_URL || "https://dingo.mainnet.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_MAINNET_MESH_URL || "https://dingo.mainnet.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_MAINNET_KUPO_URL || "https://dingo.mainnet.blinklabs.cloud:1442",
  },
  preview: {
    blockfrostUrl: import.meta.env.VITE_DINGO_BLOCKFROST_URL || "https://dingo.preview.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_UTXORPC_URL || "https://dingo.preview.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_MESH_URL || "https://dingo.preview.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_KUPO_URL || "https://dingo.preview.blinklabs.cloud:1442",
  },
  preprod: {
    blockfrostUrl: import.meta.env.VITE_DINGO_PREPROD_BLOCKFROST_URL || "https://dingo.preprod.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_PREPROD_UTXORPC_URL || "https://dingo.preprod.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_PREPROD_MESH_URL || "https://dingo.preprod.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_PREPROD_KUPO_URL || "https://dingo.preprod.blinklabs.cloud:1442",
  },
  musashi: {
    blockfrostUrl: import.meta.env.VITE_DINGO_MUSASHI_BLOCKFROST_URL || "https://dingo.musashi.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_MUSASHI_UTXORPC_URL || "https://dingo.musashi.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_MUSASHI_MESH_URL || "https://dingo.musashi.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_MUSASHI_KUPO_URL || "https://dingo.musashi.blinklabs.cloud:1442",
  },
  dijkstra: {
    blockfrostUrl: import.meta.env.VITE_DINGO_DIJKSTRA_BLOCKFROST_URL || "https://dingo.dijkstra.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_DIJKSTRA_UTXORPC_URL || "https://dingo.dijkstra.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_DIJKSTRA_MESH_URL || "https://dingo.dijkstra.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_DIJKSTRA_KUPO_URL || "https://dingo.dijkstra.blinklabs.cloud:1442",
  },
  "prime-testnet": {
    blockfrostUrl: import.meta.env.VITE_DINGO_PRIME_TESTNET_BLOCKFROST_URL || "https://dingo.prime-testnet.blinklabs.cloud",
    utxorpcUrl: import.meta.env.VITE_DINGO_PRIME_TESTNET_UTXORPC_URL || "https://dingo.prime-testnet.blinklabs.cloud:9090",
    meshUrl: import.meta.env.VITE_DINGO_PRIME_TESTNET_MESH_URL || "https://dingo.prime-testnet.blinklabs.cloud:8080",
    kupoUrl: import.meta.env.VITE_DINGO_PRIME_TESTNET_KUPO_URL || "https://dingo.prime-testnet.blinklabs.cloud:1442",
  },
}[DINGO_NETWORK.id];
export const DINGO_CONFIG = Object.freeze({
  blockfrostUrl: endpoints.blockfrostUrl.replace(/\/$/, ""),
  utxorpcUrl: endpoints.utxorpcUrl.replace(/\/$/, ""),
  meshUrl: endpoints.meshUrl.replace(/\/$/, ""),
  kupoUrl: endpoints.kupoUrl.replace(/\/$/, ""),
});
