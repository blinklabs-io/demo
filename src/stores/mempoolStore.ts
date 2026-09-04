import { create } from "zustand";
import {
  getMempoolSubmitClient,
  readMempoolSnapshot,
  decodeMempoolTx,
  type PendingTx,
} from "../lib/dingo/utxorpc/streaming";

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
let feedGeneration = 0;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let activeWatchIterator: AsyncIterator<{ nativeBytes: Uint8Array }> | null =
  null;
let snapshotInFlightGeneration: number | null = null;
let mempoolRevision = 0;
const txRevisions = new Map<string, number>();

async function watchLoop(
  startedGeneration: number,
  set: (partial: Partial<MempoolState>) => void,
  get: () => MempoolState,
) {
  while (feedGeneration === startedGeneration) {
    let iterator: AsyncIterator<{ nativeBytes: Uint8Array }> | null = null;
    try {
      const client = getMempoolSubmitClient();
      iterator = client.watchMempool()[Symbol.asyncIterator]();
      activeWatchIterator = iterator;
      while (feedGeneration === startedGeneration) {
        const result = await iterator.next();
        if (result.done) {
          break;
        }
        const event = result.value;
        if (feedGeneration !== startedGeneration) {
          return;
        }
        const tx = decodeMempoolTx(event.nativeBytes);
        if (!tx) {
          continue;
        }
        const next = new Map(get().pendingTxs);
        next.set(tx.hash, tx);
        txRevisions.set(tx.hash, ++mempoolRevision);
        set({ pendingTxs: next, status: "live", error: null });
      }
      // The stream ended cleanly (server closed it) - reconnect.
    } catch (err) {
      if (feedGeneration !== startedGeneration) {
        return;
      }
      set({
        status: "error",
        error:
          err instanceof Error ? err.message : "Mempool stream disconnected.",
      });
    } finally {
      if (iterator && activeWatchIterator === iterator) {
        activeWatchIterator = null;
      }
    }
    if (feedGeneration !== startedGeneration) {
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
    const startedGeneration = ++feedGeneration;
    set({ status: "connecting", error: null });

    const runSnapshot = async () => {
      if (snapshotInFlightGeneration === startedGeneration) {
        return;
      }
      snapshotInFlightGeneration = startedGeneration;
      const snapshotRevision = mempoolRevision;
      try {
        const txs = await readMempoolSnapshot();
        if (feedGeneration !== startedGeneration) {
          return;
        }
        const current = get().pendingTxs;
        const next = new Map<string, PendingTx>();
        for (const tx of txs) {
          const existing = current.get(tx.hash);
          next.set(tx.hash, existing ? { ...tx, seenAt: existing.seenAt } : tx);
        }
        for (const [hash, tx] of current) {
          if ((txRevisions.get(hash) ?? 0) > snapshotRevision) {
            next.set(hash, tx);
          }
        }
        set({
          pendingTxs: next,
          status: "live",
          error: null,
        });
        for (const [hash, revision] of txRevisions) {
          if (revision <= snapshotRevision) {
            txRevisions.delete(hash);
          }
        }
      } catch (err) {
        if (feedGeneration !== startedGeneration) {
          return;
        }
        set({
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Could not read Dingo's mempool.",
        });
      } finally {
        if (snapshotInFlightGeneration === startedGeneration) {
          snapshotInFlightGeneration = null;
        }
      }
    };

    void runSnapshot();
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
    }
    snapshotTimer = setInterval(() => void runSnapshot(), SNAPSHOT_INTERVAL_MS);

    void watchLoop(startedGeneration, set, get);
  },

  stop: () => {
    feedGeneration++;
    void activeWatchIterator?.return?.();
    activeWatchIterator = null;
    txRevisions.clear();
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      snapshotTimer = null;
    }
    set({ status: "idle", error: null, pendingTxs: new Map() });
  },
}));
