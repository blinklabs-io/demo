import { Core } from "@blaze-cardano/sdk";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, notifyManager, queryOptions } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { LeiosTransactions } from "./LeiosTransactions";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";

vi.mock("../../lib/dingo/config", () => ({ DINGO_NETWORK: { id: "musashi" } }));
vi.mock("../../lib/dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("../../lib/dingo/blockHeader", () => ({ blockBytesQuery: (hash: string) => queryOptions({ queryKey: ["native", hash], queryFn: async () => new Uint8Array([hash === "legacy" ? 0x84 : 0x82, hash === "parent" ? 1 : hash === "legacy" || hash === "unextended" ? 3 : 2]) }) }));
vi.mock("../../lib/dingo/leios", () => ({ decodeLeiosBlock: (bytes: Uint8Array) => bytes[1] === 3 ? null : ({ certified: bytes[1] === 2, announcement: { hash: (bytes[1] === 1 ? "aa" : "bb").repeat(32), bytes: bytes[1] === 1 ? 90000 : 80000 } }) }));

it.each(["Load next 100 transactions", "Read all transaction sizes"])("shows certified EB identity, sizes, links and partial records using %s", async (action) => {
  const body = "a300800180021a00030d40", hash = Core.blake2b_256(Core.HexBlob(body)), cbor = `84${body}a0f6f5`;
  const row = { tx_hash: hash, cbor };
  vi.mocked(blockfrostFetch).mockImplementation(async (path) => {
    if (path === "/api/v0/blocks/parent") return { hash: "parent", height: 9, slot: 90 };
    if (path.includes("page=1")) return [...Array(99).fill(row), { tx_hash: "33".repeat(32), cbor: "invalid" }];
    if (path.includes("page=2")) return [row];
    throw new Error("Unexpected request " + path);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"), root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><LeiosTransactions block={{ hash: "child", height: 10, slot: 100, previous_block: "parent", tx_count: 101, time: 0, epoch: 1, epoch_slot: 1, size: 2, slot_leader: "pool" }} /></MemoryRouter></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toContain("The transactions behind the certificate.");
    expect(container.textContent).toContain("90,000");
    expect(container.textContent).toContain("aa".repeat(32));
    expect(container.textContent).not.toContain("bb".repeat(32));
    expect(container.textContent).toContain("Loaded transaction bytes");
    expect(container.textContent).toContain(`${(99 * cbor.length / 2).toLocaleString()}`);
    expect(container.querySelector(`a[href="/explorer/tx/${hash}?network=musashi"]`)).not.toBeNull();
    const button = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === action)!;
    await act(async () => button.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toContain("100 decoded of 101 transactions");
    expect(container.textContent).toContain("1 transactions could not be decoded");
    expect(container.textContent).toContain("Loaded transaction bytes");
    expect(container.textContent).not.toContain("Load next 100");
  } finally {
    await act(async () => root.unmount()); client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});

it.each(["legacy", "unextended"])("keeps transactions viewable for %s native blocks without a Leios observation", async (kind) => {
  const body = "a300800180021a00030d40";
  const hash = Core.blake2b_256(Core.HexBlob(body));
  const cbor = `84${body}a0${kind === "legacy" ? "f5f6" : "f6f5"}`;
  vi.mocked(blockfrostFetch).mockResolvedValue([{ tx_hash: hash, cbor }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"), root = createRoot(container);
  notifyManager.setScheduler(queueMicrotask);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><LeiosTransactions block={{ hash: kind, height: 10, slot: 100, previous_block: "parent", tx_count: 1, time: 0, epoch: 1, epoch_slot: 1, size: 2, slot_leader: "pool" }} /></MemoryRouter></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.textContent).toContain("1 decoded of 1 transactions");
    expect(container.textContent).not.toContain("could not be decoded");
  } finally {
    await act(async () => root.unmount()); client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  }
});
