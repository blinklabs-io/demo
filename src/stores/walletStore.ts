import { create } from "zustand";
import { Core } from "@blaze-cardano/sdk";
import type { Cip30Wallet, Cip30WalletApi } from "../lib/dingo/cip30";

const LAST_WALLET_KEY = "dingo-demo.wallet";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface WalletDetails {
  usedAddresses: string[];
  changeAddress: string | null;
  rewardAddress: string | null;
  balanceLovelace: bigint | null;
}

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
    balanceLovelace: Core.Serialization.Value.fromCbor(
      Core.HexBlob(balanceCbor),
    ).coin(),
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

export const useWalletStore = create<WalletState>((set, get) => ({
  status: "disconnected",
  walletName: null,
  walletApi: null,
  error: null,
  ...emptyDetails,

  listAvailableWallets: listWallets,

  connect: async (walletName: string) => {
    const wallet = window.cardano?.[walletName] as Cip30Wallet | undefined;
    if (!wallet) {
      set({ status: "error", error: `Wallet "${walletName}" was not found.` });
      return;
    }
    set({ status: "connecting", error: null });
    try {
      const api = await wallet.enable();
      const details = await loadWalletDetails(api);
      set({
        status: "connected",
        walletName,
        walletApi: api,
        error: null,
        ...details,
      });
      rememberWallet(walletName);
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to connect wallet.",
      });
    }
  },

  disconnect: () => {
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
    if (!wallet?.isEnabled) {
      return;
    }
    const isEnabled = await wallet.isEnabled().catch(() => false);
    if (!isEnabled) {
      return;
    }
    await get().connect(lastWallet);
  },

  refreshBalance: async () => {
    const { walletApi } = get();
    if (!walletApi) {
      return;
    }
    const details = await loadWalletDetails(walletApi);
    set(details);
  },
}));
