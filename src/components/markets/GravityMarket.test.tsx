import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GravityMarket } from "./GravityMarket";
import {
  readGravityPools,
  readGravityPoolComposition,
} from "../../lib/gravity/read";
const state = vi.hoisted(() => ({
  id: "a",
  directoryError: false,
  compositionError: false,
}));
vi.mock("../../lib/gravity/read", () => ({
  readGravityPools: vi.fn(async (_asset: string, page: number) => {
    if (state.directoryError && page === 2)
      throw new Error("Directory unavailable");
    return {
      pools: [
        {
          id: state.id,
          poolHash: state.id,
          poolType: 0,
          assetA: "lovelace",
          assetB: "33".repeat(28),
          address: "oracle",
          poolAddress: "pool",
          txHash: "44".repeat(32),
        },
      ],
      errors: [],
      partial: true,
    };
  }),
  readGravityPoolComposition: vi.fn(async (_pool: unknown, page: number) => {
    if (state.compositionError && page === 2)
      throw new Error("Outputs unavailable");
    return { outputs: [], amounts: [], utxoCount: 0, partial: true };
  }),
}));
vi.mock("../../stores/tipStore", () => ({
  useTipStore: { subscribe: () => () => {} },
}));
vi.mock("../chain/UtxoConstellation", () => ({
  UtxoConstellation: () => null,
}));
vi.mock("../NetworkLink", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("../explorer/CopyButton", () => ({ CopyButton: () => null }));
vi.mock("./assets", () => ({
  MarketAsset: ({ unit }: { unit: string }) => <span>{unit}</span>,
  MarketLoading: ({ error }: { error?: Error }) => (
    <div role="status">{error?.message ?? "Loading"}</div>
  ),
}));
let host: HTMLDivElement, root: Root, client: QueryClient;
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
};
const click = async (label: string) => {
  let button: HTMLButtonElement | undefined;
  await vi.waitFor(async () => {
    await settle();
    button = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === label,
    );
    expect(button, label).toBeDefined();
    expect(button!.disabled, label).toBe(false);
  });
  await act(async () => {
    button!.click();
  });
  await settle();
};
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(state, {
    id: "a",
    directoryError: false,
    compositionError: false,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <GravityMarket />
      </QueryClientProvider>,
    );
  });
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
it("uses output page one immediately when refreshed directory changes the effective pool", async () => {
  await click("Next outputs →");
  expect(host.textContent).toContain("Output page 2");
  state.id = "b";
  vi.mocked(readGravityPoolComposition).mockClear();
  await click("Refresh ↻");
  expect(host.textContent).toContain("Output page 1");
  expect(
    vi
      .mocked(readGravityPoolComposition)
      .mock.calls.some(([pool, page]) => pool.id === "b" && page === 1),
  ).toBe(true);
  expect(
    vi
      .mocked(readGravityPoolComposition)
      .mock.calls.some(([pool, page]) => pool.id === "b" && page !== 1),
  ).toBe(false);
});
it("keeps previous output and directory controls available after later-page errors", async () => {
  state.compositionError = true;
  await click("Next outputs →");
  expect(host.textContent).toContain("Outputs unavailable");
  await click("← Previous outputs");
  expect(host.textContent).toContain("Output page 1");
  state.directoryError = true;
  await click("Next pairs →");
  expect(host.textContent).toContain("Directory unavailable");
  await click("← Previous pairs");
  expect(host.textContent).toContain("Page 1");
  expect(readGravityPools).toHaveBeenCalled();
});
