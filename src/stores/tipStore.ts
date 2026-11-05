import { create } from "zustand";
import {
  getSyncClient,
  decodeTipEvent,
  type LiveTip,
} from "../lib/dingo/utxorpc/streaming";

const WATCH_RETRY_DELAY_MS = 5_000;

export type TipStatus = "idle" | "connecting" | "live" | "error";

interface TipState {
  status: TipStatus;
  error: string | null;
  tip: LiveTip | null;
  revision: number;
  lastAction: "apply" | "undo" | "reset" | "connect" | null;
  lastEventAt: number | null;
  start: () => void;
  stop: () => void;
}

// Same StrictMode-safety rationale as mempoolStore's connectGeneration:
// this is started once from AppShell, which is mounted for the app's
// entire lifetime, so a real stop() is not expected in normal use.
let feedGeneration = 0;
let activeWatchIterator: AsyncIterator<Parameters<typeof decodeTipEvent>[0]> | null =
  null;

export const useTipStore = create<TipState>((set, get) => ({
  status: "idle",
  error: null,
  tip: null,
  revision: 0,
  lastAction: null,
  lastEventAt: null,

  start: () => {
    if (get().status !== "idle" && get().status !== "error") {
      return;
    }
    const startedGeneration = ++feedGeneration;
    set((state) => ({
      status: "connecting", error: null, tip: null,
      lastAction: "connect", lastEventAt: Date.now(), revision: state.revision + 1,
    }));

    (async () => {
      while (feedGeneration === startedGeneration) {
        let iterator: AsyncIterator<Parameters<typeof decodeTipEvent>[0]> | null =
          null;
        try {
          const client = getSyncClient();
          iterator = client.followTip()[Symbol.asyncIterator]();
          activeWatchIterator = iterator;
          // No intersect point: Dingo starts the stream from its current
          // tip, which is exactly what a "what just landed" indicator wants
          // - this app has no interest in replaying history on connect.
          while (feedGeneration === startedGeneration) {
            const result = await iterator.next();
            if (result.done) {
              break;
            }
            if (feedGeneration !== startedGeneration) {
              return;
            }
            const event = result.value;
            if (event.action === "apply") {
              const tip = decodeTipEvent(event);
              if (tip) {
                set((state) => ({
                  tip,
                  status: "live",
                  error: null,
                  lastAction: "apply",
                  lastEventAt: tip.receivedAt,
                  revision: state.revision + (state.tip?.hash === tip.hash ? 0 : 1),
                }));
              }
            } else {
              set((state) => ({
                tip: null,
                status: "live",
                error: null,
                lastAction: event.action,
                lastEventAt: Date.now(),
                revision: state.revision + 1,
              }));
            }
          }
        } catch (err) {
          if (feedGeneration !== startedGeneration) {
            return;
          }
          set({
            status: "error",
            error:
              err instanceof Error ? err.message : "Tip stream disconnected.",
          });
        } finally {
          if (iterator && activeWatchIterator === iterator) {
            activeWatchIterator = null;
          }
        }
        if (feedGeneration !== startedGeneration) {
          return;
        }
        set((state) => ({
          status: "connecting", error: null, tip: null,
          lastAction: "connect",
          lastEventAt: state.lastAction === "connect" ? state.lastEventAt : Date.now(),
          revision: state.revision + (state.lastAction === "connect" ? 0 : 1),
        }));
        await new Promise((resolve) =>
          setTimeout(resolve, WATCH_RETRY_DELAY_MS),
        );
      }
    })();
  },

  stop: () => {
    feedGeneration++;
    void activeWatchIterator?.return?.();
    activeWatchIterator = null;
    set({ status: "idle", error: null, tip: null, lastAction: null, lastEventAt: null });
  },
}));
