import { selectedDingoNetwork } from "./networks";

export const DINGO_NETWORK = Object.freeze(selectedDingoNetwork());
const musashi = DINGO_NETWORK.id === "musashi";
const preprod = DINGO_NETWORK.id === "preprod";
export const DINGO_CONFIG = Object.freeze({
  blockfrostUrl: (musashi
    ? import.meta.env.VITE_DINGO_MUSASHI_BLOCKFROST_URL ||
      "https://dingo.musashi.blinklabs.cloud"
    : preprod
      ? import.meta.env.VITE_DINGO_PREPROD_BLOCKFROST_URL ||
        "https://dingo.preprod.blinklabs.cloud"
      : import.meta.env.VITE_DINGO_BLOCKFROST_URL || "http://127.0.0.1:3000"
  ).replace(/\/$/, ""),
  utxorpcUrl: (musashi
    ? import.meta.env.VITE_DINGO_MUSASHI_UTXORPC_URL ||
      "https://dingo.musashi.blinklabs.cloud:9090"
    : preprod
      ? import.meta.env.VITE_DINGO_PREPROD_UTXORPC_URL ||
        "https://dingo.preprod.blinklabs.cloud:9090"
      : import.meta.env.VITE_DINGO_UTXORPC_URL || "http://127.0.0.1:9090"
  ).replace(/\/$/, ""),
  meshUrl: (musashi
    ? import.meta.env.VITE_DINGO_MUSASHI_MESH_URL ||
      "https://dingo.musashi.blinklabs.cloud:8080"
    : preprod
      ? import.meta.env.VITE_DINGO_PREPROD_MESH_URL ||
        "https://dingo.preprod.blinklabs.cloud:8080"
      : import.meta.env.VITE_DINGO_MESH_URL || "http://127.0.0.1:8080"
  ).replace(/\/$/, ""),
});
