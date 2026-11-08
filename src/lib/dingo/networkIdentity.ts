import { DINGO_NETWORK } from "./config";

export const CARDANO_NETWORK_ID = DINGO_NETWORK.id === "mainnet" ? 1 : 0;
