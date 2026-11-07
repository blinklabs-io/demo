import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
  queryOptions,
} from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LeiosPulse } from "./LeiosPulse";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { blockBytesQuery } from "../../lib/dingo/blockHeader";
import { decodeLeiosBlock } from "../../lib/dingo/leios";
vi.mock("../../lib/dingo/config", () => ({
  DINGO_NETWORK: { id: "musashi", label: "Musashi", networkMagic: 164 },
  DINGO_CONFIG: {
    blockfrostUrl: "https://musashi.example",
    utxorpcUrl: "https://rpc.musashi.example",
  },
}));
vi.mock("../../lib/dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("../../lib/dingo/blockHeader", () => ({ blockBytesQuery: vi.fn() }));
vi.mock("../../lib/dingo/leios", async (original) => ({
  ...(await original<typeof import("../../lib/dingo/leios")>()),
  decodeLeiosBlock: vi.fn(),
}));
vi.mock("../../lib/explorer/recentBlocks", () => ({
  recentBlocksQuery: {
    queryKey: ["dingo", "recent-blocks"],
    queryFn: async () => ({ blocks, incomplete: false }),
  },
}));
const blocks = [
  { hash: "11".repeat(32), height: 10, slot: 100 },
  { hash: "22".repeat(32), height: 9, slot: 90 },
];
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  notifyManager.setScheduler(queueMicrotask);
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 164 });
  vi.mocked(blockBytesQuery).mockImplementation(
    (hash) =>
      queryOptions({
        queryKey: ["dingo", "block-native", hash],
        queryFn: async (): Promise<Uint8Array> => new Uint8Array([1]),
        retry: false,
      }),
  );
  vi.mocked(decodeLeiosBlock).mockImplementation((_, block) => ({
    ...block,
    certified: block.height === 10,
    announcement:
      block.height === 9 ? { hash: "aa".repeat(32), bytes: 131072 } : null,
    certificate:
      block.height === 10
        ? { signerCount: 2, bitfieldBytes: 1, signatureBytes: 48 }
        : null,
    rankingTransactions: 0,
    nativeBytes: 1000,
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.useRealTimers();
});
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LeiosPulse />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
it("selects ranking blocks and removes rolled-back selections from the displayed sample", async () => {
  await render();
  expect(host.textContent).toContain("A certificate joins the chain.");
  await act(async () =>
    (
      host.querySelector(
        '[aria-label="Inspect ranking block 9"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(host.textContent).toContain("An endorser block is announced.");
  expect(host.textContent).toContain("131,072 bytes");
  expect(
    host.querySelector(
      'a[href="/explorer/block/' + blocks[1].hash + '?network=musashi"]',
    ),
  ).not.toBeNull();
  await act(async () =>
    client.setQueryData(["dingo", "recent-blocks"], {
      blocks: [blocks[0]],
      incomplete: false,
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(host.textContent).not.toContain("An endorser block is announced.");
  expect(host.textContent).toContain("A certificate joins the chain.");
});
it("does not read native blocks when genesis belongs to another network", async () => {
  vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 2 });
  client.setQueryData(["dingo", "recent-blocks"], {
    blocks,
    incomplete: false,
  });
  await render();
  expect(host.textContent).toContain("serving a different network");
  expect(blockBytesQuery).not.toHaveBeenCalled();
});
it("retains other observations when a native block cannot be decoded", async () => {
  vi.mocked(decodeLeiosBlock).mockImplementation((_, block) => {
    if (block.height === 9) throw new Error("Unknown native format");
    return {
      ...block,
      certified: false,
      announcement: null,
      certificate: null,
      rankingTransactions: 0,
      nativeBytes: 1000,
    };
  });
  await render();
  expect(host.textContent).toContain(
    "Native Leios data unavailable for 1 sampled blocks",
  );
  expect(host.textContent).toContain("The ranking chain moves forward.");
});
