import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WingRidersMarket } from "./WingRidersMarket";
import { readRapidPool, readRapidPools } from "../../lib/wingriders/read";
import { quoteRapidSwap, type RapidPool } from "../../lib/wingriders/data";
import { prepareRapidSwap } from "../../lib/wingriders/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: () => ({
    status: "disconnected",
    tokens: [],
    balanceLovelace: null,
  }),
}));
vi.mock("../../lib/wingriders/read", () => ({
  readRapidPool: vi.fn(),
  readRapidPools: vi.fn(),
}));
vi.mock("../../lib/wingriders/transactions", () => ({
  prepareRapidSwap: vi.fn(async () => ({})),
  submitRapidSwap: vi.fn(),
}));
vi.mock("./MarketTransaction", () => ({
  MarketConfirmation: () => null,
  MarketTransaction: (props: {
    ready: boolean;
    draftKey: string;
    title: string;
    prepare: (api: Cip30WalletApi, current: () => void) => Promise<unknown>;
  }) => (
    <button
      disabled={!props.ready}
      data-draft-key={props.draftKey}
      onClick={() => void props.prepare({} as Cip30WalletApi, () => {})}
    >
      {props.title}
    </button>
  ),
}));
const pool = {
  name: "aa".repeat(32),
  assetA: "lovelace",
  assetB: "22".repeat(28) + "544f4b454e",
  reserveA: 10000000n,
  reserveB: 100000000n,
  issuedShares: 1000000n,
  treasuryA: 0n,
  treasuryB: 0n,
  feeFrom: 0n,
  treasuryFees: [10n, 10n],
  swapFees: [30n, 30n],
  feeBasis: 10000n,
  utxo: {
    input: () => ({ transactionId: () => "33".repeat(32), index: () => 0n }),
  },
} as unknown as RapidPool;
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(readRapidPools).mockResolvedValue({
    pools: [pool],
    errors: [],
    nextToken: "next",
  });
  vi.mocked(readRapidPool).mockResolvedValue(pool);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
});
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <WingRidersMarket />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  );
  await flush();
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
}
function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype,
    "value",
  )!.set!.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLInputElement ? "input" : "change", {
      bubbles: true,
    }),
  );
}
it("forwards exact input and reviewed output in both directions", async () => {
  await render();
  await act(async () => button("Review WingRiders Rapid swap").click());
  expect(prepareRapidSwap).toHaveBeenLastCalledWith(
    expect.anything(),
    {
      poolName: pool.name,
      aToB: true,
      amount: 100000n,
      minimum: quoteRapidSwap(pool, true, 100000n).received,
    },
    expect.any(Function),
  );
  await act(async () => change(host.querySelector("select")!, "b-to-a"));
  await act(async () => button("Review WingRiders Rapid swap").click());
  expect(prepareRapidSwap).toHaveBeenLastCalledWith(
    expect.anything(),
    {
      poolName: pool.name,
      aToB: false,
      amount: 1000000n,
      minimum: quoteRapidSwap(pool, false, 1000000n).received,
    },
    expect.any(Function),
  );
});
it("loads bounded pages using opaque cursors", async () => {
  await render();
  await act(async () => button("Next pools").click());
  await flush();
  expect(readRapidPools).toHaveBeenCalledWith("next", expect.any(AbortSignal));
  expect(host.textContent).toContain("Page 2");
  await act(async () => button("Previous pools").click());
  await flush();
  expect(host.textContent).toContain("Page 1");
});
it("shows failed explicit pool lookups and prevents approval", async () => {
  await render();
  vi.mocked(readRapidPool).mockRejectedValue(
    new Error("Pool state is ambiguous"),
  );
  await act(async () =>
    change(host.querySelector("input[pattern]")!, "bb".repeat(32)),
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await flush();
  expect(host.textContent).toContain("Pool state is ambiguous");
  expect(host.textContent).not.toContain("Review WingRiders Rapid swap");
  expect(prepareRapidSwap).not.toHaveBeenCalled();
});
it("blocks invalid amounts while retaining the pool catalog", async () => {
  await render();
  await act(async () => change(host.querySelector("input[inputmode]")!, "-1"));
  expect(button("Review WingRiders Rapid swap").disabled).toBe(true);
  expect(host.querySelectorAll(".market-card")).toHaveLength(1);
});

it("changes the draft key when the pool output changes without changing its quote", async () => {
  await render();
  const before = button("Review WingRiders Rapid swap").dataset.draftKey;
  await act(async () => {
    client.setQueryData(["dingo", "markets", "wingriders", "pools", ""], {
      pools: [
        {
          ...pool,
          utxo: {
            input: () => ({
              transactionId: () => "44".repeat(32),
              index: () => 0n,
            }),
          },
        },
      ],
      errors: [],
      nextToken: "",
    });
  });
  await flush();
  expect(button("Review WingRiders Rapid swap").dataset.draftKey).not.toBe(
    before,
  );
});

it("uses integer token defaults on initial selection and implicit pool changes", async () => {
  const tokenPool = { ...pool, name: "bb".repeat(32), assetA: pool.assetB, assetB: "lovelace", reserveA: pool.reserveB, reserveB: pool.reserveA };
  vi.mocked(readRapidPools).mockResolvedValue({ pools: [tokenPool], errors: [], nextToken: "" });
  await render();
  expect(host.querySelector<HTMLInputElement>("input[inputmode]")!.value).toBe("1000000");
  expect(button("Review WingRiders Rapid swap").disabled).toBe(false);
  await act(async () => change(host.querySelector("input[inputmode]")!, "123"));
  await act(async () => { client.setQueryData(["dingo", "markets", "wingriders", "pools", ""], { pools: [pool], errors: [], nextToken: "" }); });
  await flush();
  expect(host.querySelector<HTMLInputElement>("input[inputmode]")!.value).toBe("0.1");
});
it("blocks reviewing retained catalog data after a refresh fails", async () => {
  await render();
  vi.mocked(readRapidPools).mockRejectedValue(new Error("Catalog verification failed"));
  await act(async () => { await client.refetchQueries({ queryKey: ["dingo", "markets", "wingriders", "pools", ""] }); });
  await flush();
  const review = button("Review WingRiders Rapid swap");
  expect(review).toBeDefined();
  expect(review.disabled).toBe(true);
  await act(async () => review.click());
  expect(prepareRapidSwap).not.toHaveBeenCalled();
});
