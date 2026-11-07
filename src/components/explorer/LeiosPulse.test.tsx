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
import { LeiosPulse, LeiosBlockPanel } from "./LeiosPulse";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { blockBytesQuery } from "../../lib/dingo/blockHeader";
import { decodeLeiosBlock } from "../../lib/dingo/leios";
import { DINGO_NETWORK } from "../../lib/dingo/config";
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
    queryFn: async () => {
      if (recentFails) throw new Error("Sample refresh failed");
      return { blocks, incomplete: false };
    },
  },
}));
const blocks = [
  { hash: "11".repeat(32), height: 10, slot: 100 },
  { hash: "22".repeat(32), height: 9, slot: 90 },
];
let host: HTMLDivElement, root: Root, client: QueryClient;
let recentFails = false;
beforeEach(() => {
  recentFails = false;
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
  await act(async () => client.setQueryData(["dingo", "recent-blocks"], { blocks, incomplete: false }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.querySelector('[aria-label="Inspect ranking block 10"]')?.getAttribute("aria-pressed")).toBe("true");
});

it("keeps a timestamped saved sample after a failed refresh and distinguishes an initial failure", async () => {
  await render();
  recentFails = true;
  await act(async () => { await client.refetchQueries({ queryKey: ["dingo", "recent-blocks"] }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.textContent).toContain("last successful sample, read");
  expect(host.textContent).toContain("A certificate joins the chain.");
  await act(async () => { await client.resetQueries({ queryKey: ["dingo", "recent-blocks"] }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.textContent).toContain("Sample refresh failed");
  expect(host.textContent).not.toContain("No decoded Leios extensions");
});

it("retries unavailable native bytes", async () => {
  let available = false;
  vi.mocked(blockBytesQuery).mockImplementation((hash) => queryOptions({
    queryKey: ["dingo", "block-native", hash], retry: false,
    queryFn: async (): Promise<Uint8Array> => { if (!available) throw new Error("Not indexed yet"); return new Uint8Array([1]); },
  }));
  await render();
  expect(host.textContent).toContain("Native Leios data unavailable for 2 sampled blocks");
  available = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(host.textContent).toContain("A certificate joins the chain.");
});

it.each(["present", "absent", "error"])("loads optional block details only after opening: %s", async (state) => {
  if (state !== "present") vi.mocked(decodeLeiosBlock).mockImplementation(() => { if (state === "error") throw new Error("Invalid native block"); return null; });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><LeiosBlockPanel block={blocks[0]} /></MemoryRouter></QueryClientProvider>));
  expect(vi.mocked(decodeLeiosBlock)).not.toHaveBeenCalled();
  await act(async () => { const details = host.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.textContent).toContain(state === "present" ? "A certificate joins the chain." : state === "error" ? "Invalid native block" : "This header has no Leios extension.");
});

it("omits the optional panel on other networks", () => {
  const network = DINGO_NETWORK as { id: string };
  network.id = "preview";
  try { expect(LeiosBlockPanel({ block: blocks[0] })).toBeNull(); }
  finally { network.id = "musashi"; }
});

it("can retry a corrected genesis endpoint and identifies incomplete samples", async () => {
  vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 2 });
  await render();
  vi.mocked(blockfrostFetch).mockResolvedValue({ network_magic: 164 });
  const retry = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Retry network verification")!;
  await act(async () => retry.click());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.textContent).toContain("A certificate joins the chain.");
  await act(async () => client.setQueryData(["dingo", "recent-blocks"], { blocks, incomplete: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(host.textContent).toContain("sample is incomplete");
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
