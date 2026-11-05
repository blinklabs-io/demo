import { kernelMinimumDeposits } from "./kernelDeposits";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MinswapMarket } from "./MinswapMarket";
import { KernelMarket } from "./KernelMarket";
const data = vi.hoisted(() => ({
  family: "options",
  records: [] as unknown[],
  imported: undefined as unknown,
  wallet: {
    status: "disconnected",
    connectionId: 0,
    walletApi: null,
    changeAddress: null,
    rewardAddress: null,
    tokens: [],
  },
}));
vi.mock("../../stores/walletStore", () => ({
  useWalletStore: () => data.wallet,
}));
vi.mock("../NetworkLink", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("./MarketTransaction", () => ({
  MarketConfirmation: () => null,
  MarketTransaction: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("./KernelCreate", () => ({ KernelCreate: () => null }));
vi.mock("../explorer/Visuals", () => ({ Gauge: () => null }));
vi.mock("../explorer/MarketChart", () => ({ MarketChart: () => null }));
vi.mock("../explorer/CopyButton", () => ({ CopyButton: () => null }));
vi.mock("../explorer/ChainMark", () => ({ ChainMark: () => null }));
vi.mock("../../lib/kernel/close", () => ({
  canCloseKernelRecord: () => false,
}));
vi.mock("../../lib/kernel/markets", () => ({
  loadKernelRequest: vi.fn(async () => data.imported),
}));
vi.mock("./kernelQuery", () => ({
  kernelPageQuery: () => ({
    queryKey: ["test", data.family],
    queryFn: async () => ({
      records: data.records,
      rejected: [],
      nextToken: "",
      snapshot: null,
    }),
  }),
  useKernelSelection: () => ({
    record: data.records[0],
    records: data.records,
  }),
}));
vi.mock("../../lib/minswap/history", () => ({
  readMinswapHistory: async () => ({ points: [], partial: false }),
}));
vi.mock("../../lib/minswap/orders", () => ({
  readMinswapOrders: async () => ({ orders: [], partial: false }),
}));
vi.mock("../../lib/minswap/read", () => ({
  readMinswapPools: async () => ({
    pools: [
      {
        id: "p",
        assetA: "lovelace",
        assetB: "33".repeat(28) + "01",
        lpAsset: "44".repeat(28) + "01",
        txHash: "11".repeat(32),
        outputIndex: 0,
        reserveA: 1000000000n,
        reserveB: 1000000n,
        totalLiquidity: 1000000n,
        feeA: 30n,
        feeB: 100n,
        dynamicFee: false,
      },
    ],
    errors: [],
    partial: false,
  }),
  readMinswapPool: vi.fn(),
  readLiquidityPositions: async () => ({
    positions: [],
    errors: ["Dingo unavailable"],
    partial: false,
  }),
}));
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  data.wallet.status = "disconnected";
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
function button(text: string) {
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  if (!b) throw new Error(`Missing ${text}`);
  return b;
}
it("changes the published input fee when the swap direction changes", async () => {
  await render(<MinswapMarket initialAction="swap" />);
  const fee = () =>
    [...host.querySelectorAll(".market-stats > div")].find((d) =>
      d.textContent?.includes("Published input-side"),
    )?.textContent;
  expect(fee()).toContain("0.3%");
  const direction = host.querySelector("select")!;
  await act(async () => {
    direction.value = "b-to-a";
    direction.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(fee()).toContain("1%");
});
it("does not claim there are no LP tokens when held positions fail to resolve", async () => {
  data.wallet.status = "connected";
  await render(<MinswapMarket />);
  expect(host.textContent).toContain(
    "Some held LP positions could not be resolved",
  );
  expect(host.textContent).not.toContain(
    "No Minswap V2 liquidity tokens found",
  );
});
function record(
  kind: string,
  fields: Record<string, unknown>,
  outpoint = "11".repeat(32) + "#0",
) {
  return {
    kind,
    fields,
    outpoint,
    lane: kind === "ProposalDatum" ? "option-proposals" : "loan-negotiation",
    lovelace: 5000000n,
    utxo: {
      input: () => ({ transactionId: () => "11".repeat(32), index: () => 0n }),
    },
  };
}
it("shows the selected option premium asset and updates selected term details", async () => {
  data.family = "options";
  data.records = [
    record("ProposalDatum", {
      offer_asset: ["", ""],
      offer_quantity: 1000000n,
      premium_asset: ["55".repeat(28), "555344"],
      possible_terms: [
        {
          fields: {
            premium: 5n,
            expiration: 1900000000000n,
            strike_price: [1n, 1n],
          },
        },
        {
          fields: {
            premium: 9n,
            expiration: 1910000000000n,
            strike_price: [2n, 1n],
          },
        },
      ],
    }),
  ];
  await render(<KernelMarket family="options" />);
  expect(host.textContent).toContain("Selected premium: 5 USD");
  expect(vi.mocked(kernelMinimumDeposits).mock.calls.at(-1)?.[0]).toMatchObject(
    { kind: "option-purchase", paymentDeposit: 0n, contractTopUp: 0n },
  );
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("Selected premium: 9 USD");
  expect(host.querySelector(".market-form")!.textContent).toContain(
    new Date(1910000000000).toLocaleString(),
  );
});
it("loads an exact request outside the current offer page and enables acceptance", async () => {
  const outpoint = "22".repeat(32) + "#2";
  data.family = "lending";
  data.records = [
    record("OfferDatum", { loan_asset: ["", ""], loan_principal: 1000000n }),
  ];
  data.imported = record(
    "AskDatum",
    { loan_asset: ["", ""], loan_principal: 1000000n },
    outpoint,
  );
  await render(<KernelMarket family="lending" />);
  const input = host.querySelector<HTMLInputElement>(
    'input[placeholder="Transaction hash#output index"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, outpoint);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    button("Load request").click();
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(host.textContent).toContain("Accept this loan offer");
  expect(host.querySelector("select")!.value).toBe(outpoint);
});

vi.mock("./kernelDeposits", async (original) => ({
  ...(await original<typeof import("./kernelDeposits")>()),
  readKernelOutputParameters: async () => 4310,
  kernelMinimumDeposits: vi.fn((action: unknown) => ({ action, outputs: [] })),
}));
