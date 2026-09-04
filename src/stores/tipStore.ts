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
  start: () => void;
  stop: () => void;
}

// Same StrictMode-safety rationale as mempoolStore's connectGeneration:
// this is started once from AppShell, which is mounted for the app's
// entire lifetime, so a real stop() is not expected in normal use.
let generation = 0;
let activeWatchIterator: AsyncIterator<Parameters<typeof decodeTipEvent>[0]> | null =
  null;

export const useTipStore = create<TipState>((set, get) => ({
  status: "idle",
  error: null,
  tip: null,

  start: () => {
    if (get().status !== "idle" && get().status !== "error") {
      return;
    }
    const myGeneration = ++generation;
    set({ status: "connecting", error: null });

    (async () => {
      while (generation === myGeneration) {
        let iterator: AsyncIterator<Parameters<typeof decodeTipEvent>[0]> | null =
          null;
        try {
          const client = getSyncClient();
          iterator = client.followTip()[Symbol.asyncIterator]();
          activeWatchIterator = iterator;
          // No intersect point: Dingo starts the stream from its current
          // tip, which is exactly what a "what just landed" indicator wants
          // - this app has no interest in replaying history on connect.
          while (generation === myGeneration) {
            const result = await iterator.next();
            if (result.done) {
              break;
            }
            if (generation !== myGeneration) {
              return;
            }
            const tip = decodeTipEvent(result.value);
            if (tip) {
              set({ tip, status: "live", error: null });
            }
            // "undo"/"reset" (rollback) events are intentionally not
            // applied here - a demo tip indicator that's briefly a block
            // behind after a rare Preview rollback is fine; the next
            // "apply" self-corrects it.
          }
        } catch (err) {
          if (generation !== myGeneration) {
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
        if (generation !== myGeneration) {
          return;
        }
        set({ status: "connecting", error: null });
        await new Promise((resolve) =>
          setTimeout(resolve, WATCH_RETRY_DELAY_MS),
        );
      }
    })();
  },

  stop: () => {
    generation++;
    void activeWatchIterator?.return?.();
    activeWatchIterator = null;
    set({ status: "idle", error: null, tip: null });
  },
}));
