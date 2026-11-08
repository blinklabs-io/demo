import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ADA_METADATA,
  EContractVersion,
  type IPoolData,
} from "@sundaeswap/core";
import { SundaeLiquidity } from "./SundaeLiquidity";
import {
  prepareLiquidity,
  prepareLiquidityCancel,
} from "../../lib/sundae/liquidity";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
const mocks = vi.hoisted(() => ({ read: vi.fn(), network: vi.fn() }));
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: () => ({ status: "disconnected", tokens: [] }),
}));
vi.mock("../../lib/dingo/utxorpc/provider", () => ({
  getDingoProvider: vi.fn(),
  assertDingoNetwork: mocks.network,
}));
vi.mock("../../lib/sundae/dingoQueryProvider", () => ({
  DingoSundaeQueryProvider: class {
    findPoolDataByIdent = mocks.read;
  },
}));
vi.mock("../../lib/sundae/protocol", () => ({
  POOL_PRESETS: [
    { ident: "aa".repeat(28), label: "ADA / TOKEN", assetBLabel: "TOKEN" },
    { ident: "bb".repeat(28), label: "ADA / SECOND", assetBLabel: "SECOND" },
  ],
}));
vi.mock("../../lib/sundae/liquidity", async (original) => ({
  ...(await original<typeof import("../../lib/sundae/liquidity")>()),
  prepareLiquidity: vi.fn(async () => ({})),
  prepareLiquidityCancel: vi.fn(async () => ({})),
}));
vi.mock("./MarketTransaction", () => ({
  MarketConfirmation: () => null,
  MarketTransaction: (props: {
    ready: boolean;
    title: string;
    prepare: (api: Cip30WalletApi, current: () => void) => Promise<unknown>;
  }) => (
    <button
      disabled={!props.ready}
      onClick={() => void props.prepare({} as Cip30WalletApi, () => {})}
    >
      {props.title}
    </button>
  ),
}));
const pool: IPoolData = {
  ident: "aa".repeat(28),
  version: EContractVersion.V3,
  currentFee: 0.003,
  assetA: ADA_METADATA,
  assetB: { assetId: "22".repeat(28) + ".544f4b454e", decimals: 0 },
  assetLP: {
    assetId: "33".repeat(28) + ".0014df10" + "aa".repeat(28),
    decimals: 0,
  },
  liquidity: { aReserve: 1000000000n, bReserve: 1000000n, lpTotal: 10000000n },
};
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.network.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue(pool);
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
          <SundaeLiquidity />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  );
  await flush();
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  )!;
}
function input(label: string) {
  return [...host.querySelectorAll("label")]
    .find((item) => item.textContent?.startsWith(label))!
    .querySelector("input")!;
}
async function fill(label: string, value: string) {
  await act(async () => {
    const element = input(label);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("matches the pool ratio and forwards exact deposit and withdrawal amounts", async () => {
  await render();
  expect(input("TOKEN").value).toBe("5000");
  await fill("ADA amount", "6.000001");
  expect(input("TOKEN").value).toBe("6001");
  await act(async () => button("Review liquidity deposit").click());
  expect(prepareLiquidity).toHaveBeenLastCalledWith(
    expect.anything(),
    pool,
    { type: "deposit", amountA: 6000001n, amountB: 6001n },
    expect.any(Function),
  );
  await act(async () => button("Withdraw").click());
  await fill("LP amount", "50000");
  expect(host.textContent).toContain("5.00 ADA");
  await act(async () => button("Review liquidity withdrawal").click());
  expect(prepareLiquidity).toHaveBeenLastCalledWith(
    expect.anything(),
    pool,
    { type: "withdraw", lp: 50000n },
    expect.any(Function),
  );
});
it("supports manual amounts and cancellation references and blocks invalid quantities", async () => {
  await render();
  await fill("TOKEN", "123");
  expect(input("TOKEN").value).toBe("123");
  await act(async () => button("Match current pool ratio").click());
  expect(input("TOKEN").value).toBe("5000");
  await fill("ADA amount", "0");
  expect(button("Review liquidity deposit").disabled).toBe(true);
  const ref = "66".repeat(32) + "#1";
  await fill("Order reference", ref);
  await act(async () => button("Review order cancellation").click());
  expect(prepareLiquidityCancel).toHaveBeenCalledWith(
    expect.anything(),
    ref,
    expect.any(Function),
  );
});
it("shows pool read failures with a retry action and no deposit review", async () => {
  mocks.read.mockRejectedValue(new Error("Pool authentication unavailable"));
  await render();
  expect(host.textContent).toContain("Pool authentication unavailable");
  expect(button("Retry pool")).toBeDefined();
  expect(host.textContent).not.toContain("Review liquidity deposit");
});

it("checks backend network identity before reading reserves", async () => {
  mocks.network.mockRejectedValue(new Error("Dingo must serve Mainnet"));
  await render();
  expect(host.textContent).toContain("Dingo must serve Mainnet");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Review liquidity deposit");
});
it("uses the cancellation parser for padded and noncanonical references", async () => {
  await render();
  const hash = "66".repeat(32);
  await fill("Order reference", `  ${hash}#1  `);
  expect(button("Review order cancellation").disabled).toBe(false);
  await act(async () => button("Review order cancellation").click());
  expect(prepareLiquidityCancel).toHaveBeenCalledWith(
    expect.anything(),
    `  ${hash}#1  `,
    expect.any(Function),
  );
  for (const index of ["01", "65536"]) {
    await fill("Order reference", `${hash}#${index}`);
    expect(button("Review order cancellation").disabled).toBe(true);
    expect(host.textContent).toContain("output index from 0 to 65535");
  }
  await fill("Order reference", `${hash}#65535`);
  expect(button("Review order cancellation").disabled).toBe(false);
});
