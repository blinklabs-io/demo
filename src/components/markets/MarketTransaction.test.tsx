import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import type { MinswapPool } from "../../lib/minswap/data";
import {
  prepareMinswapAction,
  submitMinswapTransaction,
} from "../../lib/minswap/transactions";
import { readTransactionConfirmation } from "../../lib/dingo/transactionConfirmation";
import { useWalletStore } from "../../stores/walletStore";
import { MinswapMarket } from "./MinswapMarket";

const boundary = vi.hoisted(() => ({
  posts: 0,
  buildPending: false,
  signPending: false,
  finishBuild: null as null | (() => void),
  finishSign: null as null | (() => void),
}));
vi.mock("../../lib/minswap/read", () => ({
  readMinswapPools: vi.fn(async () => ({
    pools: [pool("11"), pool("22")],
    partial: false,
    errors: [],
  })),
  readMinswapPool: vi.fn(async (pool: MinswapPool) => pool),
  readLiquidityPositions: vi.fn(async () => ({
    positions: [],
    partial: false,
    errors: [],
  })),
}));
vi.mock("../../lib/minswap/history", () => ({
  readMinswapHistory: vi.fn(async () => ({ points: [], partial: false })),
}));
vi.mock("../../lib/minswap/orders", () => ({
  readMinswapOrders: vi.fn(async () => ({ orders: [], partial: false })),
}));
vi.mock("../../lib/minswap/transactions", () => ({
  prepareMinswapAction: vi.fn(),
  prepareMinswapCancel: vi.fn(),
  submitMinswapTransaction: vi.fn(),
}));
vi.mock("../../lib/dingo/transactionConfirmation", async (original) => ({
  ...(await original<
    typeof import("../../lib/dingo/transactionConfirmation")
  >()),
  readTransactionConfirmation: vi.fn(async () => null),
}));
vi.mock("../explorer/ChainMark", () => ({
  ChainMark: () => <svg aria-hidden="true" />,
}));
vi.mock("../explorer/MarketChart", () => ({ MarketChart: () => null }));
const submittedHash = "ab".repeat(32);
const api = {} as Cip30WalletApi;
const draft = () =>
  ({
    tx: Core.Transaction.fromCbor(
      Core.TxCBOR(
        `84a30081825820${"11".repeat(32)}00018182581d60${"22".repeat(28)}1a00989680021a00029810a0f5f6`,
      ),
    ),
  }) as Awaited<ReturnType<typeof prepareMinswapAction>>;
function pool(prefix: string): MinswapPool {
  return {
    id: prefix.repeat(32),
    assetA: "lovelace",
    assetB: "33".repeat(28) + "544f4b",
    lpAsset: "44".repeat(28) + prefix.repeat(32),
    address: "addr_test1_fixture",
    txHash: prefix.repeat(32),
    outputIndex: 0,
    datum: "d87980",
    reserveA: 1000000000n,
    reserveB: 1000000n,
    totalLiquidity: 10000000n,
    feeA: 30n,
    feeB: 30n,
    dynamicFee: false,
  };
}
let root: Root,
  container: HTMLDivElement,
  client: QueryClient,
  router: ReturnType<typeof createMemoryRouter>;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  vi.spyOn(Core.Address.prototype, "toBech32").mockReturnValue(
    "addr_test1_fixture" as Core.PaymentAddress,
  );
  boundary.posts = 0;
  boundary.buildPending = false;
  boundary.signPending = false;
  boundary.finishBuild = null;
  boundary.finishSign = null;
  vi.mocked(prepareMinswapAction).mockClear();
  vi.mocked(submitMinswapTransaction).mockClear();
  vi.mocked(readTransactionConfirmation).mockClear();
  vi.mocked(prepareMinswapAction).mockImplementation(
    async (_api, _pool, _action, guard) => {
      guard();
      if (boundary.buildPending)
        return new Promise((resolve) => {
          boundary.finishBuild = () => resolve(draft());
        });
      return draft();
    },
  );
  vi.mocked(submitMinswapTransaction).mockImplementation(
    async (_api, _draft, guard) => {
      guard();
      if (boundary.signPending)
        return new Promise((resolve, reject) => {
          boundary.finishSign = () => {
            try {
              guard();
              boundary.posts++;
              resolve(submittedHash);
            } catch (error) {
              reject(error);
            }
          };
        });
      boundary.posts++;
      return submittedHash;
    },
  );
  useWalletStore.setState({
    status: "connected",
    connectionId: 1,
    walletApi: api,
    changeAddress: "addr_test1_fixture",
    tokens: [],
    refreshBalance: vi.fn(async () => {}),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  router = createMemoryRouter(
    [
      { path: "/market", element: <MinswapMarket initialAction="swap" /> },
      { path: "/other", element: <p>Other page</p> },
    ],
    { initialEntries: ["/market"] },
  );
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  );
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount());
  router.dispose();
  client.clear();
  container.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function button(label: string) {
  const match = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === label);
  if (!match) throw new Error("Missing button: " + label);
  return match;
}
async function click(label: string) {
  await act(async () => button(label).click());
  await settle();
}
async function changeAmount(value: string) {
  const label = [...container.querySelectorAll("label")].find((label) =>
    label.textContent?.startsWith("ADA amount"),
  )!;
  const input = label?.querySelector("input");
  if (!input) throw new Error("Missing ADA amount field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
function transactionLink() {
  return [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) =>
    link.getAttribute("href")?.includes(submittedHash),
  );
}
it("keeps accepted hash and confirmation when market selection and amounts change", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  expect(boundary.posts).toBe(1);
  expect(transactionLink()).toBeTruthy();
  const markets = container.querySelectorAll<HTMLButtonElement>(".market-card");
  await act(async () => markets[1].click());
  await changeAmount("");
  expect(transactionLink()).toBeTruthy();
  expect(container.textContent).toContain("Submitted · waiting for inclusion");
  expect(readTransactionConfirmation).toHaveBeenCalledWith(
    submittedHash,
    expect.any(AbortSignal),
  );
});
it("keeps accepted tracking when a refreshed catalog removes its transaction form", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  await act(async () => {
    client.setQueryData(["dingo", "markets", "minswap", "pools", 1, ""], {
      pools: [],
      partial: false,
      errors: [],
    });
  });
  await settle();
  expect(container.querySelector(".market-form")).toBeNull();
  expect(transactionLink()).toBeTruthy();
  expect(container.textContent).toContain("Submitted · waiting for inclusion");
});
it("discards an old reviewed transaction after reconnecting the same wallet API", async () => {
  await click("Review transaction");
  expect(button("Sign & submit")).toBeTruthy();
  await act(async () => {
    useWalletStore.setState({
      connectionId: 2,
      walletApi: api,
      status: "connected",
    });
  });
  await settle();
  expect(
    [...container.querySelectorAll("button")].some(
      (node) => node.textContent === "Sign & submit",
    ),
  ).toBe(false);
  expect(button("Review transaction").disabled).toBe(false);
});
it("does not publish a build result that belongs to a previous connection", async () => {
  boundary.buildPending = true;
  await click("Review transaction");
  await act(async () => {
    useWalletStore.setState({ connectionId: 2 });
  });
  await act(async () => boundary.finishBuild!());
  await settle();
  expect(
    [...container.querySelectorAll("button")].some(
      (node) => node.textContent === "Sign & submit",
    ),
  ).toBe(false);
  expect(button("Review transaction").disabled).toBe(false);
});
it("rejects an old signing continuation after authored amounts change A to B to A", async () => {
  await click("Review transaction");
  boundary.signPending = true;
  await click("Sign & submit");
  await changeAmount("6");
  await changeAmount("5");
  await act(async () => boundary.finishSign!());
  await settle();
  expect(boundary.posts).toBe(0);
  expect(transactionLink()).toBeUndefined();
});
it("rejects a pending signature after navigation unmounts the market", async () => {
  await click("Review transaction");
  boundary.signPending = true;
  await click("Sign & submit");
  await act(async () => {
    await router.navigate("/other");
  });
  await act(async () => boundary.finishSign!());
  await settle();
  expect(boundary.posts).toBe(0);
  expect(container.textContent).toBe("Other page");
});
it("invalidates a pending approval when wallet APIs change A to B to A without a connection counter change", async () => {
  await click("Review transaction");
  boundary.signPending = true;
  await click("Sign & submit");
  await act(async () =>
    useWalletStore.setState({ walletApi: {} as Cip30WalletApi }),
  );
  await settle();
  await act(async () => useWalletStore.setState({ walletApi: api }));
  await settle();
  await act(async () => boundary.finishSign!());
  await settle();
  expect(boundary.posts).toBe(0);
  expect(transactionLink()).toBeUndefined();
});
it("starts only one preparation when the review control is activated twice before rendering", async () => {
  boundary.buildPending = true;
  const review = button("Review transaction");
  await act(async () => {
    review.click();
    review.click();
  });
  await settle();
  expect(prepareMinswapAction).toHaveBeenCalledTimes(1);
  await act(async () => boundary.finishBuild!());
  await settle();
  expect(button("Sign & submit")).toBeTruthy();
});
it("offers an explicit fresh draft after a submission error without automatically signing again", async () => {
  await click("Review transaction");
  vi.mocked(submitMinswapTransaction).mockRejectedValueOnce(
    new Error("Dingo submission unavailable"),
  );
  await click("Sign & submit");
  expect(container.textContent).toContain("Dingo submission unavailable");
  await click("Discard draft");
  expect(container.textContent).not.toContain("Dingo submission unavailable");
  expect(button("Review transaction").disabled).toBe(false);
  expect(submitMinswapTransaction).toHaveBeenCalledTimes(1);
  expect(prepareMinswapAction).toHaveBeenCalledTimes(1);
});
it("rejects approval once the displayed account changes before React commits its new form", async () => {
  await click("Review transaction");
  boundary.signPending = true;
  await click("Sign & submit");
  await act(async () => {
    useWalletStore.setState({ changeAddress: "addr_test1_other_account" });
    boundary.finishSign!();
  });
  await settle();
  expect(boundary.posts).toBe(0);
  expect(transactionLink()).toBeUndefined();
});
