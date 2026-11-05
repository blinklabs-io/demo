import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import type { PreparedTool, ToolAction } from "../../lib/tools/transactions";
import { useWalletStore } from "../../stores/walletStore";
import { ToolTransaction } from "./ToolTransaction";

const boundary = vi.hoisted(() => ({
  finish: null as (() => void) | null,
  guard: null as (() => void) | null,
  posts: 0,
}));
vi.mock("../../lib/tools/transactions", async (original) => ({
  ...(await original<typeof import("../../lib/tools/transactions")>()),
  prepareToolTransaction: async (
    _api: Cip30WalletApi,
    action: ToolAction,
    assert: () => void,
  ) => {
    assert();
    return {
      action,
      tx: new Core.Transaction(
        new Core.TransactionBody(
          Core.CborSet.fromCore([], Core.TransactionInput.fromCore),
          [],
          170000n,
        ),
        new Core.TransactionWitnessSet(),
      ),
      facts: [{ label: "Donation", value: "10 ADA" }],
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
const refreshBalance = useWalletStore.getState().refreshBalance;
let root: Root,
  container: HTMLDivElement,
  client: QueryClient,
  authoredValid: boolean;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  boundary.finish = null;
  boundary.guard = null;
  boundary.posts = 0;
  authoredValid = true;
  notifyManager.setScheduler(queueMicrotask);
  const address = Core.Address.fromBytes(Core.HexBlob("60" + "11".repeat(28)));
  const api = {
    getNetworkId: async () => 0,
    getUsedAddresses: async () => [address.toBytes()],
    getChangeAddress: async () => address.toBytes(),
    getRewardAddresses: async () => [],
    getBalance: async () => new Core.Value(100000000n).toCbor(),
  } as unknown as Cip30WalletApi;
  useWalletStore.setState({
    refreshBalance: async () => {},
    status: "connected",
    walletApi: api,
    connectionId: 1,
  });
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ToolTransaction
            draftKey="donation"
            action={() => ({ kind: "donate", amount: "10" })}
            assertDraft={() => {
              if (!authoredValid) throw new Error("Caller draft changed");
            }}
          />
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
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
it("cancels a direct shared-tool approval when the component unmounts, without relying on a page wrapper", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  const oldGuard = boundary.guard!;
  await act(async () => root.render(<p>Another page</p>));
  expect(() => oldGuard()).toThrow("Draft details changed");
  await act(async () => boundary.finish!());
  boundary.finish = null;
  expect(boundary.posts).toBe(0);
});
it("preserves the direct caller's authored-draft assertion while mounted", async () => {
  await click("Review transaction");
  await click("Sign & submit");
  authoredValid = false;
  expect(() => boundary.guard!()).toThrow("Caller draft changed");
  await act(async () => boundary.finish!());
  boundary.finish = null;
  expect(boundary.posts).toBe(0);
});
