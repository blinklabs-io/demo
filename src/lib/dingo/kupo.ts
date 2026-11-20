import { DINGO_CONFIG } from "./config";

const MAX_BYTES = 1024 * 1024;
export const KUPO_PREVIEW_LIMIT = 20;

export function isKupoReadPath(path: string) {
  if (!/^\/(health|metrics|checkpoints|matches|patterns|datums|scripts|metadata)(?:[/?]|$)/.test(path) || /[\\#]/.test(path)) return false;
  try {
    const url = new URL(path, DINGO_CONFIG.kupoUrl);
    return url.origin === new URL(DINGO_CONFIG.kupoUrl).origin &&
      !decodeURIComponent(path.split("?")[0]).split("/").some(part => part === "." || part === "..");
  } catch { return false; }
}

export async function kupoFetch(path: string, signal?: AbortSignal) {
  if (!isKupoReadPath(path)) throw new Error("Choose a relative, read-only Kupo endpoint.");
  signal?.throwIfAborted();
  return fetch(DINGO_CONFIG.kupoUrl + path, {
    method: "GET", signal,
    headers: { Accept: "application/json;asset-quantity=string" },
  });
}

// Kupo streams matches without a limit parameter. Read a bounded prefix and
// cancel the reader after one extra record establishes that results were cut.
export async function readKupoPayload(response: Response, signal?: AbortSignal) {
  if (!response.body) throw new Error("The index returned an empty response body.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  let text = "", bytes = 0, position = 0, started = false, ended = false, separator = false, afterComma = false;
  const records: unknown[] = [];
  const array = response.headers.get("Content-Type")?.includes("application/json") !== false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      bytes += chunk.value?.length ?? 0;
      if (bytes > MAX_BYTES) throw new Error("Indexed response exceeds the 1 MiB preview limit. Narrow the query.");
      text += decoder.decode(chunk.value, { stream: !chunk.done });
      if (array && text.trimStart().startsWith("[")) {
        if (!started) { position = text.indexOf("[") + 1; started = true; }
        while (!ended) {
          while (/\s/.test(text[position] ?? "") && position < text.length) position++;
          if (position === text.length) break;
          if (separator) {
            if (text[position] === "]") { ended = true; position++; break; }
            if (text[position] !== ",") throw new Error("The index returned an invalid JSON array.");
            position++; separator = false; afterComma = true;
            while (/\s/.test(text[position] ?? "") && position < text.length) position++;
            if (position === text.length) break;
            if (text[position] === "]") throw new Error("The index returned an invalid JSON array.");
          } else if (text[position] === "]") { if (afterComma) throw new Error("The index returned an invalid JSON array."); ended = true; position++; break; }
          let depth = 0, quoted = false, escaped = false, end = position;
          for (; end < text.length; end++) {
            const c = text[end];
            if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
            else if (c === '"') quoted = true;
            else if (c === "{" || c === "[") depth++;
            else if ((c === "," || c === "]") && depth === 0) break;
            else if (c === "}" || c === "]") depth--;
            if (depth < 0) throw new Error("The index returned an invalid JSON array.");
          }
          if (end === text.length) break;
          records.push(JSON.parse(text.slice(position, end)));
          position = end; separator = true; afterComma = false;
          if (records.length > KUPO_PREVIEW_LIMIT) {
            await reader.cancel();
            return { data: records.slice(0, KUPO_PREVIEW_LIMIT), truncated: true };
          }
        }
        if (ended && text.slice(position).trim()) throw new Error("The index returned trailing JSON data.");
      }
      if (chunk.done) {
        if (started) {
          if (!ended) throw new Error("The index returned an incomplete JSON array.");
          return { data: records, truncated: false };
        }
        return { data: array ? JSON.parse(text) as unknown : text, truncated: false };
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readKupo(path: string, signal?: AbortSignal) {
  const response = await kupoFetch(path, signal);
  const payload = await readKupoPayload(response, signal);
  if (!response.ok) throw new Error(`The index returned HTTP ${response.status}: ${JSON.stringify(payload.data).slice(0, 300)}`);
  return payload;
}

export type KupoMatch = {
  transaction_id: string; output_index: number; address: string;
  value: { coins: string; assets: Record<string, string> };
  created_at: { slot_no: number; header_hash: string };
  spent_at: { slot_no: number; header_hash: string } | null;
  datum_hash: string | null; script_hash: string | null;
};
function quantity(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > 18446744073709551615n) throw new Error("Invalid or imprecise indexed quantity.");
  return value;
}
export function decodeKupoMatch(value: unknown): KupoMatch {
  if (!value || typeof value !== "object") throw new Error("Invalid indexed output.");
  const row = value as KupoMatch;
  const hash = (s: unknown, length: number) => typeof s === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(s);
  const point = (p: KupoMatch["created_at"]) => p && Number.isSafeInteger(p.slot_no) && p.slot_no >= 0 && hash(p.header_hash, 64);
  if (!hash(row.transaction_id, 64) || !Number.isInteger(row.output_index) || row.output_index < 0 || row.output_index > 0xffffffff || typeof row.address !== "string" || !row.address || !point(row.created_at) || (row.spent_at !== null && !point(row.spent_at)) || (row.datum_hash !== null && !hash(row.datum_hash, 64)) || (row.script_hash !== null && !hash(row.script_hash, 56)) || !row.value) throw new Error("Unsupported indexed output fields.");
  const assets: Record<string, string> = {};
  if (row.value.assets && (typeof row.value.assets !== "object" || Array.isArray(row.value.assets))) throw new Error("Invalid indexed assets.");
  for (const [unit, amount] of Object.entries(row.value.assets ?? {})) {
    if (!/^[a-f0-9]{56}\.[a-f0-9]{0,64}$/.test(unit) || unit.split(".")[1].length % 2) throw new Error("Invalid indexed asset identifier.");
    assets[unit] = quantity(amount);
  }
  return { ...row, value: { coins: quantity(row.value.coins), assets } };
}

export function kupoMatchesPath(pattern: string, status: "unspent" | "spent" | "all") {
  const value = pattern.trim();
  if (!value || value.length > 512 || /[?#\\\s]/.test(value) || value.split("/").length > 2 || value.split("/").some(p => p === "." || p === "..")) throw new Error("Enter a valid indexed-output pattern.");
  const encoded = value.split("/").map(encodeURIComponent).join("/");
  return `/matches/${encoded}?order=most_recent_first${status === "all" ? "" : `&${status}`}`;
}
