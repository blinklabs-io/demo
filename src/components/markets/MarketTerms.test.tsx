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
  poolError: false,
  positionReads: 0,
  poolReads: 0,
  selectedReads: 0,
  positionRows: [] as unknown[],
  orderSenders: [] as string[],
  collateralChoices: [{ policyId: "33".repeat(28), name: "01" }],
  records: [] as unknown[],
  imported: undefined as unknown,
  wallet: {
    status: "disconnected",
    connectionId: 0,
    walletApi: null,
    changeAddress: null as string | null,
    usedAddresses: [] as string[],
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
  MarketTransaction: ({
    title,
    draftKey,
  }: {
    title: string;
    draftKey: string;
  }) => <div data-draft-key={draftKey}>{title}</div>,
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
  readMinswapOrders: async (senders: string[]) => {
    data.orderSenders = senders;
    return { orders: [], partial: false };
  },
}));
vi.mock("../../lib/minswap/read", () => ({
  readMinswapPools: async () => {
    data.poolReads++;
    if (data.poolError) throw new Error("Refresh unavailable");
    return {
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
    };
  },
  readMinswapPool: async (pool: unknown) => {
    data.selectedReads++;
    return pool;
  },
  readLiquidityPositions: async () => {
    data.positionReads++;
    return {
      positions: data.positionRows,
      errors: ["Dingo unavailable"],
      partial: false,
    };
  },
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
  data.poolError = false;
  data.positionReads = 0;
  data.poolReads = 0;
  data.selectedReads = 0;
  data.positionRows = [];
  data.orderSenders = [];
  data.wallet.usedAddresses = [];
  data.wallet.changeAddress = null;
  data.collateralChoices = [{ policyId: "33".repeat(28), name: "01" }];
  vi.mocked(kernelMinimumDeposits).mockClear();
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
  const outpoint = "ab".repeat(32) + "#2";
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
    )!.set!.call(input, outpoint.toUpperCase());
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

it("retains cached pools and the selected action when a background refresh fails", async () => {
  await render(<MinswapMarket />);
  expect(host.querySelectorAll(".market-card")).toHaveLength(1);
  data.poolError = true;
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["dingo", "markets", "minswap", "pools", 1, ""],
    });
  });
  expect(host.querySelectorAll(".market-card")).toHaveLength(1);
  expect(host.textContent).toContain("Showing the last loaded pools");
  expect(host.textContent).toContain("Create a Minswap order");
  data.poolError = false;
  await act(async () => {
    button("Retry pool refresh").click();
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(host.textContent).not.toContain("Showing the last loaded pools");
});

vi.mock("../../lib/kernel/lifecycle", async (original) => ({
  ...(await original<typeof import("../../lib/kernel/lifecycle")>()),
  loanCollateralChoices: () => data.collateralChoices,
}));
async function selectRequest(outpoint: string) {
  const select = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.trim().startsWith("Your loan request"))!
    .querySelector("select")!;
  await act(async () => {
    select.value = outpoint;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function loanRecords() {
  const askRef = "22".repeat(32) + "#1";
  data.family = "lending";
  data.records = [
    record("OfferDatum", { loan_asset: ["", ""], loan_principal: 1000000n }),
    record(
      "AskDatum",
      { loan_asset: ["", ""], loan_principal: 1000000n },
      askRef,
    ),
  ];
  return askRef;
}
it("requires an explicit compatible collateral choice and passes changes to the reviewed action", async () => {
  const askRef = loanRecords();
  data.collateralChoices = [
    { policyId: "33".repeat(28), name: "01" },
    { policyId: "44".repeat(28), name: "02" },
  ];
  await render(<KernelMarket family="lending" />);
  await selectRequest(askRef);
  expect(host.textContent).toContain("Choose the collateral asset to lock");
  expect(host.textContent).not.toContain("Accept this loan offer");
  const picker = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Loan collateral"]',
  )!;
  const second = "44".repeat(28) + "02";
  expect(picker.textContent).toContain(second);
  await act(async () => {
    picker.value = second;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("Accept this loan offer");
  expect(vi.mocked(kernelMinimumDeposits).mock.calls.at(-1)?.[0]).toMatchObject(
    {
      kind: "loan-accept",
      collateral: { policyId: "44".repeat(28), name: "02" },
    },
  );
  const priorKey = host
    .querySelector("[data-draft-key]")!
    .getAttribute("data-draft-key");
  const first = "33".repeat(28) + "01";
  await act(async () => {
    picker.value = first;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(vi.mocked(kernelMinimumDeposits).mock.calls.at(-1)?.[0]).toMatchObject(
    { collateral: { policyId: "33".repeat(28), name: "01" } },
  );
  expect(
    host.querySelector("[data-draft-key]")!.getAttribute("data-draft-key"),
  ).not.toBe(priorKey);
});
it("automatically uses the sole compatible collateral without another selection", async () => {
  const askRef = loanRecords();
  await render(<KernelMarket family="lending" />);
  await selectRequest(askRef);
  expect(host.textContent).toContain("Accept this loan offer");
  const picker = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Loan collateral"]',
  )!;
  expect(picker.disabled).toBe(true);
  expect(picker.value).toBe("33".repeat(28) + "01");
  expect(vi.mocked(kernelMinimumDeposits).mock.calls.at(-1)?.[0]).toMatchObject(
    { collateral: { policyId: "33".repeat(28), name: "01" } },
  );
});

it("accepts exact decimal slippage and rejects excess precision instead of rounding", async () => {
  await render(<MinswapMarket initialAction="swap" />);
  const field = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Slippage tolerance"))!
    .querySelector("input")!;
  async function change(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await change("1.1");
  expect(host.textContent).toContain("Estimated output");
  expect(host.textContent).not.toContain("Enter slippage");
  await change("1.111");
  expect(host.textContent).toContain("at most two decimal places");
  expect(host.textContent).not.toContain("Estimated output");
});
it("Refresh retries unresolved wallet LP positions", async () => {
  data.wallet.status = "connected";
  await render(<MinswapMarket />);
  const before = data.positionReads;
  expect(before).toBeGreaterThan(0);
  await act(async () => {
    button("Refresh ↻").click();
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(data.positionReads).toBeGreaterThan(before);
});

it("polls mounted pool pages and off-page selections every 30 seconds, then stops when inactive", async () => {
  vi.useFakeTimers();
  try {
    data.wallet.status = "connected";
    const pool = {
      id: "offpage",
      assetA: "lovelace",
      assetB: "33".repeat(28) + "01",
      lpAsset: "44".repeat(28) + "01",
      txHash: "55".repeat(32),
      outputIndex: 0,
      reserveA: 1000000000n,
      reserveB: 1000000n,
      totalLiquidity: 1000000n,
      feeA: 30n,
      feeB: 100n,
      dynamicFee: false,
    };
    data.positionRows = [
      { pool, lpAmount: 100n, amountA: 100n, amountB: 100n, shareBps: 1 },
    ];
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MinswapMarket />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => button("Manage position ↑").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const beforePools = data.poolReads,
      beforeSelected = data.selectedReads;
    expect(beforeSelected).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(data.poolReads).toBeGreaterThan(beforePools);
    expect(data.selectedReads).toBeGreaterThan(beforeSelected);
    await act(async () => root.render(null));
    const afterPools = data.poolReads,
      afterSelected = data.selectedReads;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(data.poolReads).toBe(afterPools);
    expect(data.selectedReads).toBe(afterSelected);
  } finally {
    vi.useRealTimers();
  }
});
it("scopes pending orders to deduplicated current and used wallet addresses", async () => {
  data.wallet.status = "connected";
  data.wallet.changeAddress = "change";
  data.wallet.usedAddresses = ["used-b", "used-a", "used-b"];
  await render(<MinswapMarket />);
  expect(data.orderSenders).toEqual(["change", "used-a", "used-b"]);
  await act(async () => {
    data.wallet.usedAddresses = ["used-c"];
    root.render(
      <QueryClientProvider client={client}>
        <MinswapMarket />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(data.orderSenders).toEqual(["change", "used-c"]);
});

it("uses Dingo chain time for lifecycle minimum-ADA preview despite a different browser clock", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(2000000000000);
  try {
    data.family = "options";
    data.records = [
      record("ProposalDatum", {
        offer_asset: ["", ""],
        offer_quantity: 1000000n,
        premium_asset: ["", ""],
        possible_terms: [
          {
            fields: {
              premium: 5000000n,
              expiration: 1900000000000n,
              strike_price: [1n, 1n],
            },
          },
        ],
      }),
    ];
    await render(<KernelMarket family="options" />);
    expect(host.textContent).toContain("Purchase this option");
    expect(vi.mocked(kernelMinimumDeposits).mock.calls.at(-1)?.[3]).toBe(
      1800000000000,
    );
  } finally {
    clock.mockRestore();
  }
});

vi.mock("../../lib/dingo/chainTime", () => ({
  readDingoChainTime: async () => 1800000000000,
}));
