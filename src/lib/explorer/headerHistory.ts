import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_CONFIG, DINGO_NETWORK } from "../dingo/config";
import { getSyncClient } from "../dingo/utxorpc/streaming";
import { bytesToHex, hexToBytes } from "../dingo/utxorpc/bytes";

export interface HeaderHistoryRow {
  hash: string;
  parent: string;
  height: number;
  slot: number;
  time: number;
  major: string;
  minor: string;
}
export interface HeaderHistorySnapshot {
  hash: string;
  height: number;
  slot: number;
  time: number;
}
export interface HeaderHistoryProgress {
  rows: HeaderHistoryRow[];
  snapshot: HeaderHistorySnapshot;
  cutoff: number;
  complete: boolean;
  cached: boolean;
  cachedRows: number;
  total: number;
}
interface Summary extends HeaderHistorySnapshot {
  previous_block: string;
}
interface Era {
  start: { slot: number; time: number };
  parameters: { slot_length: number };
}
type NativeBlock = Awaited<
  ReturnType<ReturnType<typeof getSyncClient>["inner"]["dumpHistory"]>
>["block"][number];
interface CachedHeader extends HeaderHistoryRow {
  nativeHeader: string;
}
interface Cache {
  version: 2;
  rows: CachedHeader[];
}
const HASH = /^[a-f\d]{64}$/;
const DAY = 86_400;
const PAGE_SIZE = 100;
const key = `dingo.header-history.v2:${JSON.stringify([DINGO_NETWORK.id, DINGO_CONFIG.blockfrostUrl, DINGO_CONFIG.utxorpcUrl])}`;
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function summary(value: Summary): Summary {
  if (
    !value ||
    !HASH.test(value.hash) ||
    !integer(value.height) ||
    !integer(value.slot) ||
    !integer(value.time) ||
    (value.previous_block !== "" && !HASH.test(value.previous_block))
  )
    throw new Error("Dingo returned an invalid block boundary.");
  return value;
}
function same(a: HeaderHistorySnapshot, b: HeaderHistorySnapshot) {
  return (
    a.hash === b.hash &&
    a.height === b.height &&
    a.slot === b.slot &&
    a.time === b.time
  );
}
function safeUInt(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Block header integer is outside the supported range.");
  return Number(value);
}
function readCache(timeAtSlot: (slot: number) => number): CachedHeader[] {
  try {
    const cache: Cache = JSON.parse(localStorage.getItem(key) ?? "null");
    if (cache?.version !== 2 || !Array.isArray(cache.rows)) return [];
    for (let i = 0; i < cache.rows.length; i++) {
      const row = cache.rows[i],
        prev = cache.rows[i - 1];
      if (!row || typeof row.nativeHeader !== "string") return [];
      const decoded = decodeHeader(
        Uint8Array.from(atob(row.nativeHeader), (c) => c.charCodeAt(0)),
        timeAtSlot,
      );
      if (
        !same(row, decoded) ||
        row.parent !== decoded.parent ||
        row.major !== decoded.major ||
        row.minor !== decoded.minor
      )
        return [];
      if (
        !row ||
        typeof row.hash !== "string" ||
        !HASH.test(row.hash) ||
        typeof row.parent !== "string" ||
        (row.parent !== "" && !HASH.test(row.parent)) ||
        !integer(row.height) ||
        !integer(row.slot) ||
        !integer(row.time) ||
        typeof row.major !== "string" ||
        !/^\d+$/.test(row.major) ||
        typeof row.minor !== "string" ||
        !/^\d+$/.test(row.minor) ||
        (prev &&
          (row.height !== prev.height + 1 ||
            row.parent !== prev.hash ||
            row.slot <= prev.slot ||
            row.time <= prev.time))
      )
        return [];
    }
    return cache.rows;
  } catch {
    return [];
  }
}
function writeCache(rows: CachedHeader[]) {
  try {
    localStorage.removeItem(key.replace(".v2:", ".v1:"));
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, rows } satisfies Cache),
    );
  } catch {
    /* Storage is optional; chain validation remains required on every read. */
  }
}
function nativeHeader(
  block: NativeBlock,
  timeAtSlot: (slot: number) => number,
): CachedHeader {
  if (!block.nativeBytes.length || block.chain.case !== "cardano")
    throw new Error(
      "Dingo returned a block without native Cardano header data.",
    );
  const reader = new Core.CborReader(
    Core.HexBlob(bytesToHex(block.nativeBytes)),
  );
  const blockLength = reader.readStartArray();
  if (blockLength !== 4 && blockLength !== 5)
    throw new Error("Unsupported block format in header history.");
  const encoded = reader.readEncodedValue();
  const row = decodeHeader(encoded, timeAtSlot);
  const { hash, height, slot } = row;
  const parsed = block.chain.value.header;
  if (
    !parsed ||
    bytesToHex(parsed.hash) !== hash ||
    safeUInt(parsed.height) !== height ||
    safeUInt(parsed.slot) !== slot
  )
    throw new Error("Native and parsed block headers do not match.");
  return row;
}
function decodeHeader(
  encoded: Uint8Array,
  timeAtSlot: (slot: number) => number,
): CachedHeader {
  const header = new Core.CborReader(Core.HexBlob.fromBytes(encoded));
  if (header.readStartArray() !== 2)
    throw new Error("Invalid native block header.");
  const fields = header.readStartArray();
  if (fields !== 10 && fields !== 15)
    throw new Error("Unsupported native block header.");
  const height = safeUInt(header.readUInt()),
    slot = safeUInt(header.readUInt());
  const parent =
    header.peekState() === Core.CborReaderState.Null
      ? (header.readNull(), "")
      : bytesToHex(header.readByteString());
  if (parent !== "" && !HASH.test(parent))
    throw new Error("Invalid native parent hash.");
  for (let i = 3; i < (fields === 10 ? 9 : 13); i++) header.skipValue();
  if (fields === 10 && header.readStartArray() !== 2)
    throw new Error("Invalid native header version.");
  const major = header.readUInt().toString(),
    minor = header.readUInt().toString();
  const hash = String(Core.blake2b_256(Core.HexBlob.fromBytes(encoded)));
  return {
    hash,
    parent,
    height,
    slot,
    time: timeAtSlot(slot),
    major,
    minor,
    nativeHeader: btoa(
      Array.from(encoded, (byte) => String.fromCharCode(byte)).join(""),
    ),
  };
}

export async function loadHeaderHistory({
  signal,
  onProgress,
}: {
  signal?: AbortSignal;
  onProgress?: (progress: HeaderHistoryProgress) => void;
} = {}): Promise<HeaderHistoryProgress> {
  signal?.throwIfAborted();
  const genesis = await blockfrostFetch<{
    network_magic: number;
    system_start: number;
  }>("/api/v0/genesis", { signal });
  if (
    genesis.network_magic !== DINGO_NETWORK.networkMagic ||
    !integer(genesis.system_start)
  )
    throw new Error(
      "Header history requires genesis data for the selected network.",
    );
  const eras = await blockfrostFetch<Era[]>("/api/v0/network/eras", { signal });
  // Blockfrost reports era start times in seconds since system start, while
  // Dingo reports UNIX timestamps; a value below system_start can only be relative.
  const startTime = (era: Era) =>
    era.start.time < genesis.system_start
      ? genesis.system_start + era.start.time
      : era.start.time;
  if (
    !eras.length ||
    eras.some(
      (era, i) =>
        !integer(era.start?.slot) ||
        !integer(era.start?.time) ||
        !Number.isSafeInteger(era.parameters?.slot_length) ||
        era.parameters.slot_length <= 0 ||
        (i > 0 &&
          (era.start.slot <= eras[i - 1].start.slot ||
            startTime(era) <= startTime(eras[i - 1]))),
    )
  )
    throw new Error("Dingo returned invalid era timing for header history.");
  const timeAtSlot = (slot: number) => {
    const era = eras.findLast((era) => era.start.slot <= slot);
    if (!era) throw new Error("Dingo has no era timing for this block.");
    const time =
      startTime(era) + (slot - era.start.slot) * era.parameters.slot_length;
    if (!integer(time))
      throw new Error("Invalid block time in header history.");
    return time;
  };
  const snapshot = summary(
    await blockfrostFetch<Summary>("/api/v0/blocks/latest", { signal }),
  );
  if (snapshot.time !== timeAtSlot(snapshot.slot))
    throw new Error("Dingo's latest block time does not match its era timing.");
  const cutoff = snapshot.time - DAY;
  const boundaries = new Map<number, Summary>([[snapshot.height, snapshot]]);
  const atHeight = async (height: number, fresh = false) => {
    if (!fresh && boundaries.has(height)) return boundaries.get(height)!;
    const block = summary(
      await blockfrostFetch<Summary>(`/api/v0/blocks/${height}`, { signal }),
    );
    if (block.height !== height || block.time !== timeAtSlot(block.slot))
      throw new Error("Dingo returned an inconsistent block boundary.");
    boundaries.set(height, block);
    return block;
  };
  const cached = readCache(timeAtSlot);
  const hint = cached.find(
    (row) => row.time >= cutoff && row.height <= snapshot.height,
  );
  let first: Summary | undefined, before: Summary | undefined;
  if (hint && hint.height > 0) {
    const candidate = await atHeight(hint.height);
    const predecessor = await atHeight(hint.height - 1);
    if (
      predecessor.time < cutoff &&
      cutoff <= candidate.time &&
      candidate.previous_block === predecessor.hash &&
      predecessor.slot < candidate.slot
    ) {
      first = candidate;
      before = predecessor;
    }
  }
  if (!first) {
    let low = 0,
      high = snapshot.height;
    while (low < high) {
      signal?.throwIfAborted();
      const middle = Math.floor((low + high) / 2),
        block = await atHeight(middle);
      if (block.time < cutoff) low = middle + 1;
      else high = middle;
    }
    first = await atHeight(low);
    before = low > 0 ? await atHeight(low - 1) : undefined;
  }
  if (
    first.time < cutoff ||
    (before &&
      (before.time >= cutoff ||
        first.previous_block !== before.hash ||
        first.slot <= before.slot))
  )
    throw new Error("Dingo could not prove the 24-hour header boundary.");
  const total = snapshot.height - first.height + 1;
  let rows = cached.filter(
    (row) => row.height >= first.height && row.height <= snapshot.height,
  );
  if (rows.length) {
    const tail = rows[rows.length - 1];
    const canonical = await atHeight(tail.height);
    if (
      rows.some(
        (row) =>
          row.time !== timeAtSlot(row.slot) ||
          row.time < cutoff ||
          row.time > snapshot.time,
      ) ||
      rows[0].height !== first.height ||
      rows[0].hash !== first.hash ||
      rows[0].parent !== first.previous_block ||
      !same(tail, canonical) ||
      tail.parent !== canonical.previous_block
    )
      rows = [];
  }
  const cachedRows = rows.length;
  const progress = (complete: boolean): HeaderHistoryProgress => ({
    rows: [...rows],
    snapshot,
    cutoff,
    complete,
    cached: cachedRows > 0,
    cachedRows,
    total,
  });
  onProgress?.(progress(false));
  let cursor: HeaderHistorySnapshot | undefined =
    rows[rows.length - 1] ?? before;
  const client = getSyncClient();
  while (rows.length < total) {
    signal?.throwIfAborted();
    const response = await client.inner.dumpHistory(
      {
        startToken: cursor
          ? {
              hash: hexToBytes(cursor.hash),
              slot: BigInt(cursor.slot),
              height: BigInt(cursor.height),
            }
          : undefined,
        maxItems: PAGE_SIZE,
      },
      { signal },
    );
    signal?.throwIfAborted();
    if (!response.block.length || response.block.length > PAGE_SIZE)
      throw new Error(
        "Dingo returned an empty or oversized header-history page before the snapshot was reached.",
      );
    for (const block of response.block) {
      const row = nativeHeader(block, timeAtSlot),
        previous = rows[rows.length - 1] ?? before;
      if (
        row.height !== (previous ? previous.height + 1 : first.height) ||
        row.parent !== (previous?.hash ?? first.previous_block) ||
        (previous &&
          (row.slot <= previous.slot || row.time <= previous.time)) ||
        row.time < cutoff ||
        row.height > snapshot.height
      )
        throw new Error(
          "Dingo header history is not a contiguous 24-hour chain.",
        );
      if (rows.length === 0 && !same(row, first))
        throw new Error(
          "Dingo header history does not match the initial block boundary.",
        );
      rows.push(row);
      if (row.height === snapshot.height) {
        if (!same(row, snapshot))
          throw new Error(
            "Dingo header history does not reach the selected snapshot.",
          );
        break;
      }
    }
    const tail = rows[rows.length - 1];
    writeCache(rows);
    onProgress?.(progress(false));
    if (rows.length < total) {
      const next = response.nextToken;
      if (
        !next ||
        bytesToHex(next.hash) !== tail.hash ||
        safeUInt(next.height) !== tail.height ||
        safeUInt(next.slot) !== tail.slot
      )
        throw new Error(
          "Dingo did not return an advancing header-history continuation token.",
        );
      cursor = tail;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  signal?.throwIfAborted();
  const anchored = await atHeight(snapshot.height, true);
  if (!same(anchored, snapshot))
    throw new Error(
      "The chain rolled back while header history was loading. Refresh to read the new chain.",
    );
  writeCache(rows);
  const result = progress(true);
  onProgress?.(result);
  return result;
}
