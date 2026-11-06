import { queryOptions } from "@tanstack/react-query";
import { blockfrostFetch } from "../dingo/blockfrost";
import { DINGO_CONFIG, DINGO_NETWORK } from "../dingo/config";
export interface EpochSummary {
  epoch: number;
  start_time: number;
  end_time: number;
  first_block_time: number;
  last_block_time: number;
  block_count: number;
  tx_count: number;
  output: string;
  fees: string;
  active_stake: string | null;
}
interface CachedEpoch extends EpochSummary {
  observedAt: number;
  completed: boolean;
}
const COMPLETED_TTL = 7 * 86400000;
const CURRENT_TTL = 600000;
const key = `dingo.epoch-summary.v1:${JSON.stringify([DINGO_NETWORK.id, DINGO_CONFIG.blockfrostUrl])}`;
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value);
function valid(value: unknown): value is EpochSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as EpochSummary;
  return (
    [
      row.epoch,
      row.start_time,
      row.end_time,
      row.first_block_time,
      row.last_block_time,
      row.block_count,
      row.tx_count,
    ].every(integer) &&
    row.end_time >= row.start_time &&
    amount(row.output) &&
    amount(row.fees) &&
    (row.active_stake === null || amount(row.active_stake))
  );
}
function stored(): CachedEpoch[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved?.version !== 1 || !Array.isArray(saved.rows)) return [];
    return saved.rows.filter(
      (row: CachedEpoch) =>
        valid(row) &&
        integer(row.observedAt) &&
        row.observedAt <= Date.now() &&
        typeof row.completed === "boolean" &&
        Date.now() - row.observedAt <
          (row.completed ? COMPLETED_TTL : CURRENT_TTL),
    );
  } catch {
    return [];
  }
}
function remember(row: CachedEpoch) {
  try {
    const rows = [...stored().filter((saved) => saved.epoch !== row.epoch), row]
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, 32);
    localStorage.setItem(key, JSON.stringify({ version: 1, rows }));
  } catch {
    /* An unavailable cache never replaces the Dingo read. */
  }
}
export function clearEpochSummaryCache() {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function epochSummaryQuery(
  epoch: number | undefined,
  currentEpoch?: number,
) {
  return queryOptions({
    queryKey: ["dingo", "epoch", epoch],
    queryFn: async ({ signal, client, queryKey }): Promise<CachedEpoch> => {
      if (epoch === undefined) throw new Error("An epoch number is required.");
      const saved = stored().find((row) => row.epoch === epoch);
      const completed = currentEpoch !== undefined && epoch < currentEpoch;
      if (
        saved &&
        !client.getQueryState(queryKey)?.isInvalidated &&
        (currentEpoch === undefined || saved.completed === completed)
      )
        return saved;
      const summary = await blockfrostFetch<EpochSummary>(
        `/api/v0/epochs/${epoch}`,
        { signal },
      );
      signal.throwIfAborted();
      if (!valid(summary) || summary.epoch !== epoch)
        throw new Error("Dingo returned an invalid epoch summary.");
      const row = { ...summary, observedAt: Date.now(), completed };
      remember(row);
      return row;
    },
    staleTime: (query) => {
      const data = query.state.data;
      if (!data) return CURRENT_TTL;
      if (
        currentEpoch !== undefined &&
        data.completed !== data.epoch < currentEpoch
      )
        return 0;
      const ttl = data.completed ? COMPLETED_TTL : CURRENT_TTL;
      return Math.max(
        0,
        ttl - Math.max(0, query.state.dataUpdatedAt - data.observedAt),
      );
    },
    gcTime: 8 * 86400000,
    refetchOnWindowFocus: false,
  });
}
