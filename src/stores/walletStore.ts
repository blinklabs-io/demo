import { create } from "zustand";
import { Core } from "@blaze-cardano/sdk";
import type { Cip30Wallet, Cip30WalletApi } from "../lib/dingo/cip30";

const LAST_WALLET_KEY = "dingo-demo.wallet";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export interface WalletToken {
  // Blockfrost-style unit: hex policy ID + hex asset name concatenated -
  // also exactly what Core.AssetId() expects, so no reformatting is needed
  // to build a tx output for one of these.
  assetId: string;
  quantity: bigint;
}

interface WalletDetails {
  usedAddresses: string[];
  changeAddress: string | null;
  rewardAddress: string | null;
  balanceLovelace: bigint | null;
  tokens: WalletToken[];
}

// Dingo's example apps and this showcase both target Preview. A wallet
// switched to Mainnet must never be allowed to build or submit here - see
// the network guard in `connect` below.
const EXPECTED_NETWORK_ID = 0; // CIP-30 network id 0 = testnet (Preview/Preprod), 1 = mainnet

interface WalletState extends WalletDetails {
  status: WalletStatus;
  walletName: string | null;
  walletApi: Cip30WalletApi | null;
  error: string | null;
  listAvailableWallets: () => Array<{ name: string; icon?: string }>;
  connect: (walletName: string) => Promise<void>;
  disconnect: () => void;
  restoreConnection: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const emptyDetails: WalletDetails = {
  usedAddresses: [],
  changeAddress: null,
  rewardAddress: null,
  balanceLovelace: null,
  tokens: [],
};

function listWallets(): Array<{ name: string; icon?: string }> {
  if (typeof window === "undefined" || !window.cardano) {
    return [];
  }
  return Object.entries(window.cardano)
    .filter(
      ([, wallet]) => typeof (wallet as Cip30Wallet)?.enable === "function",
    )
    .map(([name, wallet]) => ({ name, icon: (wallet as Cip30Wallet).icon }));
}

async function loadWalletDetails(api: Cip30WalletApi): Promise<WalletDetails> {
  const [usedAddressesHex, changeAddressHex, rewardAddressesHex, balanceCbor] =
    await Promise.all([
      api.getUsedAddresses(),
      api.getChangeAddress(),
      api.getRewardAddresses(),
      api.getBalance(),
    ]);

  const balance = Core.Serialization.Value.fromCbor(Core.HexBlob(balanceCbor));
  const multiasset = balance.multiasset();
  const tokens: WalletToken[] = multiasset
    ? [...multiasset.entries()]
        .map(([assetId, quantity]) => ({ assetId: String(assetId), quantity }))
        .sort((a, b) => a.assetId.localeCompare(b.assetId))
    : [];

  return {
    usedAddresses: usedAddressesHex.map(
      (hex) => Core.Address.fromBytes(Core.HexBlob(hex)).toBech32() as string,
    ),
    changeAddress: Core.Address.fromBytes(
      Core.HexBlob(changeAddressHex),
    ).toBech32() as string,
    rewardAddress: rewardAddressesHex[0]
      ? (Core.Address.fromBytes(
          Core.HexBlob(rewardAddressesHex[0]),
        ).toBech32() as string)
      : null,
    balanceLovelace: balance.coin(),
    tokens,
  };
}

function rememberWallet(walletName: string | null) {
  try {
    if (walletName) {
      window.localStorage.setItem(LAST_WALLET_KEY, walletName);
    } else {
      window.localStorage.removeItem(LAST_WALLET_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) - not fatal.
  }
}

// Bumped on every connect/disconnect so an in-flight connect() that loses a
// race against a disconnect() (or a second connect()) can detect it's stale
// and not resurrect a connection the user already left.
let connectGeneration = 0;

export const useWalletStore = create<WalletState>((set, get) => ({
  status: "disconnected",
  walletName: null,
  walletApi: null,
  error: null,
  ...emptyDetails,

  listAvailableWallets: listWallets,

  connect: async (walletName: string) => {
    const generation = ++connectGeneration;
    const wallet = window.cardano?.[walletName] as Cip30Wallet | undefined;
    if (!wallet) {
      set({
        status: "error",
        error: `Wallet "${walletName}" was not found.`,
        walletName: null,
        walletApi: null,
        ...emptyDetails,
      });
      return;
    }
    set({
      status: "connecting",
      error: null,
      ...emptyDetails,
      walletName: null,
      walletApi: null,
    });
    try {
      const api = await wallet.enable();
      const networkId = await api.getNetworkId();
      if (networkId !== EXPECTED_NETWORK_ID) {
        if (connectGeneration === generation) {
          set({
            status: "error",
            error: `Connected wallet reports unsupported network id ${networkId}. This app only supports a testnet-connected wallet (Preview/Preprod) - switch the wallet's network and reconnect.`,
          });
        }
        return;
      }
      const details = await loadWalletDetails(api);
      if (connectGeneration !== generation) {
        // A disconnect (or a newer connect) happened while we were awaiting;
        // don't resurrect a connection the user already moved past.
        return;
      }
      set({
        status: "connected",
        walletName,
        walletApi: api,
        error: null,
        ...details,
      });
      rememberWallet(walletName);
    } catch (err) {
      if (connectGeneration === generation) {
        set({
          status: "error",
          error:
            err instanceof Error ? err.message : "Failed to connect wallet.",
        });
      }
    }
  },

  disconnect: () => {
    connectGeneration++;
    rememberWallet(null);
    set({
      status: "disconnected",
      walletName: null,
      walletApi: null,
      error: null,
      ...emptyDetails,
    });
  },

  restoreConnection: async () => {
    let lastWallet: string | null;
    try {
      lastWallet = window.localStorage.getItem(LAST_WALLET_KEY);
    } catch {
      return;
    }
    if (!lastWallet) {
      return;
    }
    const wallet = window.cardano?.[lastWallet] as Cip30Wallet | undefined;
    if (!wallet) {
      return;
    }
    const restoreGeneration = connectGeneration;
    if (wallet.isEnabled) {
      const isEnabled = await wallet.isEnabled().catch(() => false);
      if (!isEnabled || connectGeneration !== restoreGeneration) {
        return;
      }
    }
    if (connectGeneration !== restoreGeneration) {
      return;
    }
    await get().connect(lastWallet);
  },

  refreshBalance: async () => {
    const api = get().walletApi;
    if (!api) {
      return;
    }
    const generation = connectGeneration;
    const details = await loadWalletDetails(api);
    if (connectGeneration === generation && get().walletApi === api) {
      set(details);
    }
  },
}));
