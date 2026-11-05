import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import type { ToolAction, PreparedTool } from "../../lib/tools/transactions";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import WalletTools from "./WalletTools";
import { useWalletStore } from "../../stores/walletStore";
const boundary = vi.hoisted(() => ({
  guard: null as (() => void) | null,
  finish: null as (() => void) | null,
  posts: 0,
  confirmed: false,
  reads: 0,
}));
vi.mock("../../components/chain/UtxoConstellation", () => ({
  UtxoConstellation: () => null,
}));
vi.mock("../../lib/tools/transactions", async (original) => ({
  ...(await original<typeof import("../../lib/tools/transactions")>()),
  walletOutputs: async () =>
    boundary.posts
      ? []
      : [0, 1].map((index) => ({
          input: () => ({
            transactionId: () => "aa".repeat(32),
            index: () => BigInt(index),
          }),
          output: () => ({
            address: () => ({
              toBech32: () => "addr_test1fixture",
              getProps: () => ({
                paymentPart: { type: Core.CredentialType.KeyHash },
              }),
            }),
            amount: () => new Core.Value(10000000n),
            datum: () => undefined,
            scriptRef: () => undefined,
          }),
        })),
  prepareToolTransaction: async (
    _api: Cip30WalletApi,
    action: ToolAction,
    assert: () => void,
  ) => {
    assert();
    return {
      action,
      facts: [],
      tx: new Core.Transaction(
        new Core.TransactionBody(
          Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
          [],
          170000n,
        ),
        new Core.TransactionWitnessSet(),
      ),
    } as unknown as PreparedTool;
  },
  submitToolTransaction: async (
    _api: Cip30WalletApi,
    _draft: PreparedTool,
    assert: () => void,
  ) => {
    assert();
    boundary.guard = assert;
    return new Promise<string>((resolve, reject) => {
      boundary.finish = () => {
        try {
          assert();
          boundary.posts++;
          resolve("11".repeat(32));
        } catch (error) {
          reject(error);
        }
      };
    });
  },
}));
vi.mock("../../lib/dingo/transactionConfirmation", async (original) => ({
  ...(await original<
    typeof import("../../lib/dingo/transactionConfirmation")
  >()),
  readTransactionConfirmation: async (hash: string) => {
    boundary.reads++;
    return boundary.confirmed
      ? { hash, block: "22".repeat(32), valid_contract: true }
      : null;
  },
}));
const refreshBalance = useWalletStore.getState().refreshBalance;
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(boundary, {
    guard: null,
    finish: null,
    posts: 0,
    confirmed: false,
    reads: 0,
  });
  notifyManager.setScheduler(queueMicrotask);
  useWalletStore.setState({
    status: "connected",
    walletApi: {} as Cip30WalletApi,
    connectionId: 1,
    refreshBalance: async () => {},
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/wallet/tools/treasury"]}>
          <Routes>
            <Route path="/wallet/tools/:tool" element={<WalletTools />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  if (boundary.finish) await act(async () => boundary.finish!());
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  useWalletStore.setState({ refreshBalance });
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function amount(value: string) {
  const input = container.querySelector<HTMLInputElement>(".tool-form input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function finish() {
  await act(async () => boundary.finish!());
  boundary.finish = null;
}
it("invalidates a reviewed transaction when the actual controlled tool form changes", async () => {
  await click("Review transaction");
  expect(container.querySelector(".tool-review")).not.toBeNull();
  await amount("20");
  expect(container.querySelector(".tool-review")).toBeNull();
});
it("does not resurrect an earlier wallet approval after A to B to A edits", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  const old = boundary.guard!;
  await amount("20");
  await amount("10");
  expect(() => old()).toThrow("Draft details changed");
  await finish();
  expect(boundary.posts).toBe(0);
  await click("Review transaction");
  await click("Sign & submit");
  await finish();
  expect(boundary.posts).toBe(1);
});
it("cancels a captured approval after leaving the tool", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  const old = boundary.guard!;
  await act(async () => root.render(<p>Another page</p>));
  expect(() => old()).toThrow("Draft details changed");
  await finish();
  expect(boundary.posts).toBe(0);
});
it("cancels a captured approval after the wallet connection changes", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  const old = boundary.guard!;
  await act(async () => {
    useWalletStore.setState({ connectionId: 2 });
  });
  expect(() => old()).toThrow("Draft details changed");
  await finish();
  expect(boundary.posts).toBe(0);
});
it("preserves the submitted hash and confirmation when the authored action changes after broadcast", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  await finish();
  expect(container.textContent).toContain("Submitted to Dingo");
  await amount("20");
  expect(
    container.querySelector('a[href="/explorer/tx/' + "11".repeat(32) + '"]'),
  ).not.toBeNull();
  boundary.confirmed = true;
  await act(async () =>
    client.refetchQueries({ queryKey: ["wallet-tools", "confirmation"] }),
  );
  expect(container.textContent).toContain("Confirmed on Preview");
  expect(boundary.posts).toBe(1);
  await click("Start another transaction");
  expect(container.textContent).toContain("Review transaction");
});

it("keeps the consolidation transaction hash when post-submit wallet refresh prunes spent selections", async () => {
  await act(async () =>
    container
      .querySelector<HTMLAnchorElement>('a[href="/wallet/tools/utxos"]')!
      .click(),
  );
  await click("Select up to 100");
  await click("Review transaction");
  await click("Sign & submit");
  await finish();
  expect(container.textContent).toContain("No eligible UTxOs");
  expect(
    container.querySelector('a[href="/explorer/tx/' + "11".repeat(32) + '"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain("Submitted to Dingo");
  expect(boundary.posts).toBe(1);
  boundary.confirmed = true;
  await act(async () =>
    client.refetchQueries({ queryKey: ["wallet-tools", "confirmation"] }),
  );
  expect(container.textContent).toContain("Confirmed on Preview");
});
