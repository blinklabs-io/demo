import { selectedDingoNetwork } from "./networks";

export const DINGO_NETWORK = Object.freeze(selectedDingoNetwork());
const preprod = DINGO_NETWORK.id === "preprod";
export const DINGO_CONFIG = Object.freeze({
  blockfrostUrl: (preprod
    ? import.meta.env.VITE_DINGO_PREPROD_BLOCKFROST_URL || "https://dingo.preprod.blinklabs.cloud"
    : import.meta.env.VITE_DINGO_BLOCKFROST_URL || "http://127.0.0.1:3000"
  ).replace(/\/$/, ""),
  utxorpcUrl: (preprod
    ? import.meta.env.VITE_DINGO_PREPROD_UTXORPC_URL || "https://dingo.preprod.blinklabs.cloud:9090"
    : import.meta.env.VITE_DINGO_UTXORPC_URL || "http://127.0.0.1:9090"
  ).replace(/\/$/, ""),
  meshUrl: (preprod
    ? import.meta.env.VITE_DINGO_PREPROD_MESH_URL || "https://dingo.preprod.blinklabs.cloud:8080"
    : import.meta.env.VITE_DINGO_MESH_URL || "http://127.0.0.1:8080"
  ).replace(/\/$/, ""),
});
