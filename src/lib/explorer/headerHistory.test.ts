import { beforeEach, expect, it, vi } from "vitest";
import { Core } from "@blaze-cardano/sdk";
import { loadHeaderHistory, type HeaderHistoryProgress } from "./headerHistory";
import { blockfrostFetch } from "../dingo/blockfrost";
import { getSyncClient } from "../dingo/utxorpc/streaming";
import { bytesToHex, hexToBytes } from "../dingo/utxorpc/bytes";
vi.mock("../dingo/config", () => ({
  DINGO_NETWORK: { id: "preview", networkMagic: 2 },
  DINGO_CONFIG: {
    blockfrostUrl: "https://rest.example",
    utxorpcUrl: "https://rpc.example",
  },
}));
vi.mock("../dingo/blockfrost", () => ({ blockfrostFetch: vi.fn() }));
vi.mock("../dingo/utxorpc/streaming", () => ({ getSyncClient: vi.fn() }));
const base = 1_000_000;
const dump = vi.fn();
const timing = (slot: number) => base + slot;
function chain(
  length = 12,
  forkAt = Infinity,
  slotShift = 0,
  dijkstra = false,
) {
  const rows = [];
  let parent = "";
  for (let height = 0; height < length; height++) {
    const slot = height * 21600 + (height >= forkAt ? slotShift : 0),
      minor = height >= forkAt ? 69 : height % 2 ? 65 : 0;
    const body = new Core.CborWriter()
      .writeStartArray(dijkstra ? 12 : 10)
      .writeInt(height)
      .writeInt(slot);
    if (parent) body.writeByteString(hexToBytes(parent));
    else body.writeNull();
    for (let i = 3; i < 9; i++) body.writeInt(0);
    body
      .writeStartArray(2)
      .writeInt(dijkstra ? 12 : 11)
      .writeInt(minor);
    if (dijkstra) body.writeBoolean(false).writeNull();
    const header = new Core.CborWriter()
      .writeStartArray(2)
      .writeEncodedValue(body.encode())
      .writeByteString(new Uint8Array())
      .encode();
    const hash = String(Core.blake2b_256(Core.HexBlob.fromBytes(header)));
    const nativeBytes = dijkstra
      ? new Core.CborWriter()
          .writeStartArray(2)
          .writeEncodedValue(header)
          .writeStartArray(3)
          .writeStartArray(0)
          .writeNull()
          .writeNull()
          .encode()
      : new Core.CborWriter()
          .writeStartArray(5)
          .writeEncodedValue(header)
          .writeStartArray(0)
          .writeStartArray(0)
          .writeStartMap(0)
          .writeStartArray(0)
          .encode();
    rows.push({
      summary: {
        hash,
        previous_block: parent,
        height,
        slot,
        time: timing(slot),
      },
      block: {
        nativeBytes,
        chain: {
          case: "cardano",
          value: {
            header: {
              height: BigInt(height),
              slot: BigInt(slot),
              hash: hexToBytes(hash),
            },
          },
        },
      },
    });
    parent = hash;
  }
  return rows;
}
let blocks: ReturnType<typeof chain>;
let tip: number;
let slotTime: (slot: number) => number;
let eras: {
  start: { slot: number; time: number };
  parameters: { slot_length: number };
}[];
const fetch = vi.mocked(blockfrostFetch);
function response() {
  fetch.mockImplementation(async (path) => {
    if (path === "/api/v0/genesis")
      return { network_magic: 2, system_start: base } as never;
    if (path === "/api/v0/network/eras") return eras as never;
    if (path === "/api/v0/blocks/latest")
      return {
        ...blocks[tip].summary,
        time: slotTime(blocks[tip].summary.slot),
      } as never;
    const height = Number(path.split("/").at(-1));
    if (!blocks[height]) throw new Error("Missing block");
    return {
      ...blocks[height].summary,
      time: slotTime(blocks[height].summary.slot),
    } as never;
  });
  dump.mockImplementation(
    async (request: {
      startToken?: { height: bigint; hash: Uint8Array };
      maxItems: number;
    }) => {
      const start = request.startToken
        ? Number(request.startToken.height) + 1
        : 0;
      const end = Math.min(start + 2, tip + 1);
      const page = blocks.slice(start, end);
      const last = page.at(-1)?.summary;
      return {
        block: page.map((r) => r.block),
        nextToken:
          end < tip + 1 && last
            ? {
                height: BigInt(last.height),
                slot: BigInt(last.slot),
                hash: hexToBytes(last.hash),
              }
            : undefined,
      };
    },
  );
}
beforeEach(() => {
  localStorage.clear();
  fetch.mockReset();
  dump.mockReset();
  vi.mocked(getSyncClient).mockReturnValue({
    inner: { dumpHistory: dump },
  } as never);
  blocks = chain();
  tip = 8;
  slotTime = timing;
  eras = [{ start: { slot: 0, time: base }, parameters: { slot_length: 1 } }];
  response();
});
it("accepts era start times relative to system start", async () => {
  eras = [{ start: { slot: 0, time: 0 }, parameters: { slot_length: 1 } }];
  const result = await loadHeaderHistory();
  expect(result.rows.map((r) => r.height)).toEqual([4, 5, 6, 7, 8]);
});
it("loads every header at the inclusive cutoff through a fixed tip, honoring continuation on short byte-capped pages", async () => {
  const updates: HeaderHistoryProgress[] = [];
  const result = await loadHeaderHistory({
    onProgress: (p) => updates.push(p),
  });
  expect(result.rows.map((r) => r.height)).toEqual([4, 5, 6, 7, 8]);
  expect(result.rows.map((r) => r.minor)).toEqual(["0", "65", "0", "65", "0"]);
  expect(result.cutoff).toBe(blocks[4].summary.time);
  expect(result.total).toBe(5);
  expect(result.complete).toBe(true);
  expect(result.cachedRows).toBe(0);
  expect(dump).toHaveBeenCalledTimes(3);
  expect(dump.mock.calls[0][0]).toMatchObject({
    startToken: { height: 3n, slot: BigInt(blocks[3].summary.slot) },
    maxItems: 100,
  });
  expect(bytesToHex(dump.mock.calls[0][0].startToken.hash)).toBe(
    blocks[3].summary.hash,
  );
  expect(updates.map((p) => [p.rows.length, p.complete])).toEqual([
    [0, false],
    [2, false],
    [4, false],
    [5, false],
    [5, true],
  ]);
  const stored = localStorage.getItem(localStorage.key(0)!)!;
  expect(stored).not.toContain("nativeBytes");
  expect(stored).toContain('"major":"11"');
});
it("uses binary search instead of a REST call for each header", async () => {
  blocks = chain(10000);
  tip = 9999;
  response();
  await loadHeaderHistory();
  const boundaries = fetch.mock.calls.filter(([path]) =>
    /^\/api\/v0\/blocks\/\d+$/.test(path),
  );
  expect(boundaries.length).toBeLessThanOrEqual(17);
  expect(dump).toHaveBeenCalledTimes(3);
});
it("derives block times through era transitions rather than applying one slot length to the whole chain", async () => {
  eras = [
    { start: { slot: 0, time: base }, parameters: { slot_length: 2 } },
    {
      start: { slot: 50000, time: base + 100000 },
      parameters: { slot_length: 1 },
    },
  ];
  slotTime = (slot) => base + (slot < 50000 ? slot * 2 : 100000 + slot - 50000);
  const result = await loadHeaderHistory();
  expect(result.rows[0].height).toBe(4);
  expect(result.rows[0].time).toBe(result.cutoff);
  expect(result.rows.at(-1)!.time).toBe(slotTime(blocks[8].summary.slot));
});
it("ends at the captured snapshot even when a response contains newer blocks", async () => {
  dump.mockImplementation(async () => ({
    block: blocks.slice(4, 11).map((r) => r.block),
  }));
  const result = await loadHeaderHistory();
  expect(result.rows.map((r) => r.height)).toEqual([4, 5, 6, 7, 8]);
  expect(result.snapshot.hash).toBe(blocks[8].summary.hash);
});
it("reuses only a canonically validated cached prefix and fetches the new tail", async () => {
  await loadHeaderHistory();
  dump.mockClear();
  fetch.mockClear();
  tip = 9;
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(4);
  expect(result.cached).toBe(true);
  expect(result.rows.map((r) => r.height)).toEqual([5, 6, 7, 8, 9]);
  expect(dump).toHaveBeenCalledTimes(1);
  expect(dump.mock.calls[0][0].startToken.height).toBe(8n);
  expect(fetch.mock.calls.some(([path]) => path === "/api/v0/blocks/8")).toBe(
    true,
  );
});
it("validates cached coverage without downloading any native blocks again", async () => {
  await loadHeaderHistory();
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(5);
  expect(result.complete).toBe(true);
  expect(dump).not.toHaveBeenCalled();
});
it("discards a cached branch after a rollback instead of blending header versions", async () => {
  await loadHeaderHistory();
  const old = blocks[6].summary.hash;
  blocks = chain(12, 6);
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(0);
  expect(result.rows.map((r) => r.hash)).not.toContain(old);
  expect(result.rows.slice(2).map((r) => r.minor)).toEqual(["69", "69", "69"]);
  expect(dump).toHaveBeenCalledTimes(3);
});
it.each(["missing", "repeated", "wrong-token", "native-mismatch"])(
  "rejects %s history without reporting completion",
  async (mode) => {
    const updates: HeaderHistoryProgress[] = [];
    if (mode === "missing") dump.mockResolvedValue({ block: [] });
    if (mode === "repeated")
      dump.mockResolvedValue({ block: [blocks[4].block, blocks[4].block] });
    if (mode === "wrong-token")
      dump.mockResolvedValue({
        block: [blocks[4].block],
        nextToken: {
          height: 3n,
          slot: BigInt(blocks[3].summary.slot),
          hash: hexToBytes(blocks[3].summary.hash),
        },
      });
    if (mode === "native-mismatch")
      dump.mockResolvedValue({
        block: [
          { ...blocks[4].block, nativeBytes: blocks[5].block.nativeBytes },
        ],
      });
    await expect(
      loadHeaderHistory({ onProgress: (p) => updates.push(p) }),
    ).rejects.toThrow();
    expect(updates.every((p) => !p.complete)).toBe(true);
  },
);
it("rejects a missing continuation token before the snapshot", async () => {
  dump.mockResolvedValue({ block: [blocks[4].block, blocks[5].block] });
  await expect(loadHeaderHistory()).rejects.toThrow("continuation token");
});
it("revalidates the finite snapshot before declaring the result complete", async () => {
  const real = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (path, init) =>
    path === "/api/v0/blocks/8"
      ? ({ ...blocks[8].summary, hash: "ff".repeat(32) } as never)
      : real(path, init),
  );
  const updates: HeaderHistoryProgress[] = [];
  await expect(
    loadHeaderHistory({ onProgress: (p) => updates.push(p) }),
  ).rejects.toThrow("rolled back");
  expect(updates.at(-1)!.rows).toHaveLength(5);
  expect(updates.every((p) => !p.complete)).toBe(true);
});
it("resumes an aborted partial cache only after validating it on the selected chain", async () => {
  const controller = new AbortController();
  const updates: HeaderHistoryProgress[] = [];
  await expect(
    loadHeaderHistory({
      signal: controller.signal,
      onProgress: (p) => {
        updates.push(p);
        if (p.rows.length === 2) controller.abort();
      },
    }),
  ).rejects.toThrow();
  expect(dump).toHaveBeenCalledTimes(1);
  expect(updates.every((p) => !p.complete)).toBe(true);
  expect(dump.mock.calls[0][1].signal).toBe(controller.signal);
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(2);
  expect(result.complete).toBe(true);
  expect(dump.mock.calls[0][0].startToken.height).toBe(5n);
});
it("rejects inconsistent network and clock data before loading history", async () => {
  const real = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (path, init) =>
    path === "/api/v0/genesis"
      ? ({ network_magic: 1, system_start: base } as never)
      : real(path, init),
  );
  await expect(loadHeaderHistory()).rejects.toThrow("selected network");
  expect(dump).not.toHaveBeenCalled();
  response();
  const normal = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (path, init) =>
    path === "/api/v0/blocks/latest"
      ? ({
          ...blocks[tip].summary,
          time: blocks[tip].summary.time + 1,
        } as never)
      : normal(path, init),
  );
  await expect(loadHeaderHistory()).rejects.toThrow("era timing");
  expect(dump).not.toHaveBeenCalled();
});
it("rejects a broken cutoff predecessor instead of omitting the first qualifying block", async () => {
  const real = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (path, init) =>
    path === "/api/v0/blocks/3"
      ? ({ ...blocks[3].summary, hash: "ff".repeat(32) } as never)
      : real(path, init),
  );
  await expect(loadHeaderHistory()).rejects.toThrow("24-hour header boundary");
  expect(dump).not.toHaveBeenCalled();
});

it("ignores malformed cached coverage and rebuilds the exact range", async () => {
  await loadHeaderHistory();
  const cacheKey = localStorage.key(0)!;
  expect(cacheKey).toContain("preview");
  expect(cacheKey).toContain("https://rest.example");
  expect(cacheKey).toContain("https://rpc.example");
  const cache = JSON.parse(localStorage.getItem(cacheKey)!);
  cache.rows[1].parent = "ff".repeat(32);
  localStorage.setItem(cacheKey, JSON.stringify(cache));
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(0);
  expect(result.complete).toBe(true);
  expect(dump).toHaveBeenCalledTimes(3);
});

it("continues exact chain validation when browser storage is unavailable", async () => {
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  try {
    const result = await loadHeaderHistory();
    expect(result.complete).toBe(true);
    expect(result.cachedRows).toBe(0);
    expect(result.rows.map((row) => row.height)).toEqual([4, 5, 6, 7, 8]);
  } finally {
    get.mockRestore();
    set.mockRestore();
  }
});

it("validates a warm cutoff with two adjacent REST blocks instead of searching the whole chain", async () => {
  blocks = chain(10000);
  tip = 9999;
  response();
  await loadHeaderHistory();
  fetch.mockClear();
  dump.mockClear();
  const read = vi.spyOn(Storage.prototype, "getItem");
  try {
    const result = await loadHeaderHistory();
    expect(result.complete).toBe(true);
    expect(result.cachedRows).toBe(5);
    expect(dump).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/v0/genesis",
      "/api/v0/network/eras",
      "/api/v0/blocks/latest",
      "/api/v0/blocks/9995",
      "/api/v0/blocks/9994",
      "/api/v0/blocks/9999",
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    read.mockRestore();
  }
});

it("rejects a cached time hint that does not bracket the authoritative cutoff", async () => {
  await loadHeaderHistory();
  const key = localStorage.key(0)!;
  const cache = JSON.parse(localStorage.getItem(key)!);
  cache.rows.forEach((row: { time: number }) => (row.time -= 21600));
  localStorage.setItem(key, JSON.stringify(cache));
  fetch.mockClear();
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.complete).toBe(true);
  expect(result.cachedRows).toBe(0);
  expect(result.rows.map((row) => row.height)).toEqual([4, 5, 6, 7, 8]);
  expect(fetch.mock.calls.map(([path]) => path)).not.toContain(
    "/api/v0/blocks/5",
  );
  expect(fetch.mock.calls.map(([path]) => path)).toContain("/api/v0/blocks/2");
  expect(dump).toHaveBeenCalledTimes(3);
});

it("re-searches a cutoff moved by a fork instead of trusting the former branch's timestamp hint", async () => {
  await loadHeaderHistory();
  const former = blocks[4].summary.hash;
  blocks = chain(12, 3, 21600);
  fetch.mockClear();
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.complete).toBe(true);
  expect(result.cachedRows).toBe(0);
  expect(result.rows[0].height).toBe(4);
  expect(result.rows[0].time).toBe(result.cutoff);
  expect(result.rows.map((row) => row.hash)).not.toContain(former);
  expect(fetch.mock.calls.map(([path]) => path)).toContain("/api/v0/blocks/5");
  expect(fetch.mock.calls.map(([path]) => path)).toContain("/api/v0/blocks/2");
  expect(dump).toHaveBeenCalledTimes(3);
});
it("rebuilds cached versions that disagree with their native header", async () => {
  const original = await loadHeaderHistory();
  const key = localStorage.key(0)!;
  const cache = JSON.parse(localStorage.getItem(key)!);
  cache.rows[1].minor = "69";
  localStorage.setItem(key, JSON.stringify(cache));
  dump.mockClear();
  const result = await loadHeaderHistory();
  expect(result.cachedRows).toBe(0);
  expect(result.rows.map((r) => r.minor)).toEqual(
    original.rows.map((r) => r.minor),
  );
  expect(dump).toHaveBeenCalled();
});

it("reads Dijkstra extended headers in the two-part native block envelope", async () => {
  blocks = chain(12, Infinity, 0, true);
  response();
  const result = await loadHeaderHistory();
  expect(result.complete).toBe(true);
  expect(result.rows.map((row) => row.major)).toEqual([
    "12",
    "12",
    "12",
    "12",
    "12",
  ]);
  expect(result.rows.map((row) => row.height)).toEqual([4, 5, 6, 7, 8]);
});
