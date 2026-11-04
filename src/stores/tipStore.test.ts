// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { CardanoTipEvent } from "@utxorpc/sdk";
import { getSyncClient } from "../lib/dingo/utxorpc/streaming";
import { useTipStore } from "./tipStore";

vi.mock("../lib/dingo/utxorpc/streaming", async (original) => ({
  ...await original<typeof import("../lib/dingo/utxorpc/streaming")>(),
  getSyncClient: vi.fn(),
}));
afterEach(() => useTipStore.getState().stop());

it("withdraws the observed tip on undo and reset without inventing a parent", async () => {
  let deliver!: (event: IteratorResult<CardanoTipEvent>) => void;
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next: () => new Promise<IteratorResult<CardanoTipEvent>>((resolve) => { deliver = resolve; }),
    return: async () => ({ done: true as const, value: undefined }),
  };
  vi.mocked(getSyncClient).mockReturnValue({followTip: () => stream} as unknown as ReturnType<typeof getSyncClient>);
  useTipStore.getState().start();
  const initial = useTipStore.getState().revision;
  const block = {header: {height: 9n, slot: 900n, hash: new Uint8Array(32).fill(1)}};
  deliver({done: false,value: {action: "apply", block} as CardanoTipEvent});
  await Promise.resolve();
  expect(useTipStore.getState().tip?.height).toBe(9);
  deliver({done: false,value: {action: "undo", block} as CardanoTipEvent});
  await Promise.resolve();
  expect(useTipStore.getState().tip).toBeNull();
  expect(useTipStore.getState().lastAction).toBe("undo");
  expect(useTipStore.getState().revision).toBe(initial + 2);
  deliver({done: false,value: {action: "reset", point: {slot: "800", hash: "02".repeat(32)}}});
  await Promise.resolve();
  expect(useTipStore.getState().tip).toBeNull();
  expect(useTipStore.getState().lastAction).toBe("reset");
  expect(useTipStore.getState().revision).toBe(initial + 3);
});
