import { create } from "zustand";
import {
  getMempoolSubmitClient,
  readMempoolSnapshot,
  decodeMempoolTx,
  type PendingTx,
} from "../lib/dingo/utxorpc/mempool";

const SNAPSHOT_INTERVAL_MS = 15_000;
const WATCH_RETRY_DELAY_MS = 5_000;

export type MempoolStatus = "idle" | "connecting" | "live" | "error";

interface MempoolState {
  status: MempoolStatus;
  error: string | null;
  pendingTxs: Map<string, PendingTx>;
  start: () => void;
  stop: () => void;
}

// Bumped by stop() (and internally by a superseding start()) so a
// still-running watch loop or snapshot timer from a previous generation
// stops writing to the store instead of resurrecting a stopped feed. This
// mirrors walletStore's connectGeneration guard, and mainly exists to
// tolerate React StrictMode's dev-only mount/unmount/mount double-invoke -
// AppShell (where this is started) is otherwise mounted for the app's
// entire lifetime, so a real stop() is not expected in normal use.
let generation = 0;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;

async function watchLoop(myGeneration: number, set: (partial: Partial<MempoolState>) => void, get: () => MempoolState) {
  while (generation === myGeneration) {
    try {
      for await (const event of getMempoolSubmitClient().watchMempool()) {
        if (generation !== myGeneration) {
          return;
        }
        const tx = decodeMempoolTx(event.nativeBytes);
        if (!tx) {
          continue;
        }
        const next = new Map(get().pendingTxs);
        next.set(tx.hash, tx);
        set({ pendingTxs: next, status: "live", error: null });
      }
      // The stream ended cleanly (server closed it) - reconnect.
    } catch (err) {
      if (generation !== myGeneration) {
        return;
      }
      set({
        status: "error",
        error:
          err instanceof Error ? err.message : "Mempool stream disconnected.",
      });
    }
    if (generation !== myGeneration) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WATCH_RETRY_DELAY_MS));
  }
}

export const useMempoolStore = create<MempoolState>((set, get) => ({
  status: "idle",
  error: null,
  pendingTxs: new Map(),

  start: () => {
    if (get().status !== "idle" && get().status !== "error") {
      return;
    }
    const myGeneration = ++generation;
    set({ status: "connecting", error: null });

    const runSnapshot = async () => {
      try {
        const txs = await readMempoolSnapshot();
        if (generation !== myGeneration) {
          return;
        }
        set({
          pendingTxs: new Map(txs.map((tx) => [tx.hash, tx])),
          status: "live",
          error: null,
        });
      } catch (err) {
        if (generation !== myGeneration) {
          return;
        }
        set({
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Could not read Dingo's mempool.",
        });
      }
    };

    void runSnapshot();
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
    }
    snapshotTimer = setInterval(() => void runSnapshot(), SNAPSHOT_INTERVAL_MS);

    void watchLoop(myGeneration, set, get);
  },

  stop: () => {
    generation++;
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      snapshotTimer = null;
    }
    set({ status: "idle", error: null, pendingTxs: new Map() });
  },
}));
