import { DINGO_NETWORK } from "./config";

export const CARDANO_NETWORK_ID =
  DINGO_NETWORK.id === "mainnet" || DINGO_NETWORK.id === "prime-mainnet"
    ? 1
    : 0;

const GENESIS_SYSTEM_START = {
  mainnet: {
    rpc: "2017-09-23T21:44:51Z",
    rest: 1_506_203_091,
  },
  "prime-mainnet": {
    rpc: "2024-05-13T17:40:00Z",
    rest: 1_715_622_000,
  },
} as const;

type GenesisSystemStartNetwork = keyof typeof GENESIS_SYSTEM_START;

function selectedSystemStart() {
  return DINGO_NETWORK.id in GENESIS_SYSTEM_START
    ? GENESIS_SYSTEM_START[
        DINGO_NETWORK.id as GenesisSystemStartNetwork
      ]
    : undefined;
}

export function matchesDingoRpcGenesis(genesis: {
  networkMagic: number;
  systemStart?: string;
}): boolean {
  const systemStart = selectedSystemStart();
  return (
    genesis.networkMagic === DINGO_NETWORK.networkMagic &&
    (!systemStart || genesis.systemStart === systemStart.rpc)
  );
}

export function matchesDingoRestGenesis(genesis: {
  network_magic: number;
  system_start?: number;
}): boolean {
  const systemStart = selectedSystemStart();
  return (
    genesis.network_magic === DINGO_NETWORK.networkMagic &&
    (!systemStart || genesis.system_start === systemStart.rest)
  );
}
