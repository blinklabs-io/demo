import { governanceName } from "../../lib/governanceMetadata";
import { PageIntro, BarChart } from "../../components/explorer/Visuals";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { Pagination } from "../../components/explorer/Pagination";
import { useInfiniteQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatAda } from "../../lib/format";

interface DRepListRow {
  drep_id: string;
  amount: string;
  has_script: boolean;
  retired: boolean;
  expired: boolean;
  metadata: {
    url: string;
    hash: string;
    json_metadata: unknown;
  } | null;
}

function safeMetadataUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function statusLabel(row: Pick<DRepListRow, "retired" | "expired">): string {
  if (row.retired) return "Retired";
  if (row.expired) return "Expired";
  return "Active";
}

interface DRepDirectoryRow extends Omit<DRepListRow, "metadata"> {
  name?: string;
  metadataUrl?: string;
}
function drepName(row: DRepDirectoryRow) {
  return (
    row.name ||
    (row.drep_id === "drep_always_abstain"
      ? "Always abstain"
      : row.drep_id === "drep_always_no_confidence"
        ? "Always no confidence"
        : row.drep_id)
  );
}
function DRepCard({ row }: { row: DRepDirectoryRow }) {
  return (
    <div className="drep-card">
      <span className="drep-identity">
        <span className="drep-avatar" aria-hidden="true">
          {row.name?.slice(0, 2).toUpperCase() || "◈"}
        </span>
        <span className="drep-name-stack">
          <strong>
            {row.name ||
              (row.drep_id === "drep_always_abstain"
                ? "Always abstain"
                : row.drep_id === "drep_always_no_confidence"
                  ? "Always no confidence"
                  : "Representative")}
          </strong>
          <HashLink kind="drep" id={row.drep_id} visible={10} />
        </span>
        {row.has_script && (
          <span className="ml-2 text-xs text-slate-500">(script)</span>
        )}
        {row.metadataUrl && safeMetadataUrl(row.metadataUrl) && (
          <a
            href={safeMetadataUrl(row.metadataUrl)}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-sky-500 hover:text-sky-300"
          >
            CIP-119 anchor
          </a>
        )}
      </span>
      <span className="text-xs text-slate-500">
        <strong>{formatAda(BigInt(row.amount))}</strong>{" "}
        <span className="status-badge">{statusLabel(row)}</span>
      </span>
    </div>
  );
}

export default function DRepList() {
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("registration");
  const [page, setPage] = useState(1);
  const query = useInfiniteQuery({
    queryKey: ["dingo", "drep-directory", filter],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        count: "100",
        order: "desc",
      });
      if (filter === "active") {
        params.set("retired", "false");
        params.set("expired", "false");
      } else if (filter !== "all") params.set(filter, "true");
      const rows = await blockfrostFetch<DRepListRow[]>(
        `/api/v0/governance/dreps?${params}`,
        { signal },
      );
      return rows.map(
        ({ metadata, ...row }): DRepDirectoryRow => ({
          ...row,
          name: governanceName(metadata?.json_metadata),
          metadataUrl: metadata?.url,
        }),
      );
    },
    getNextPageParam: (last, _pages, param) =>
      last.length === 100 ? param + 1 : undefined,
    staleTime: 60_000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isError]);
  const rows = useMemo(
    () => [
      ...new Map(
        (query.data?.pages.flat() ?? []).map((row) => [row.drep_id, row]),
      ).values(),
    ],
    [query.data],
  );
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const selected = rows.filter(
      (row) =>
        (!needle ||
          [row.drep_id, drepName(row)].some((value) =>
            value.toLowerCase().includes(needle),
          )) &&
        (kind !== "script" || row.has_script) &&
        (kind !== "key" ||
          (!row.has_script && !row.drep_id.startsWith("drep_always_"))) &&
        (kind !== "automatic" || row.drep_id.startsWith("drep_always_")),
    );
    if (sort === "amount")
      selected.sort((a, b) => {
        const left = BigInt(a.amount),
          right = BigInt(b.amount);
        return (
          (left > right ? -1 : left < right ? 1 : 0) ||
          a.drep_id.localeCompare(b.drep_id)
        );
      });
    else if (sort === "name")
      selected.sort(
        (a, b) =>
          drepName(a).localeCompare(drepName(b)) ||
          a.drep_id.localeCompare(b.drep_id),
      );
    return selected;
  }, [rows, search, kind, sort]);
  const loading =
    !query.isError &&
    (query.isPending || query.hasNextPage || query.isFetchingNextPage);
  const active = Boolean(
    search || filter !== "active" || kind !== "all" || sort !== "registration",
  );
  const reset = () => {
    setSearch("");
    setFilter("active");
    setKind("all");
    setSort("registration");
    setPage(1);
  };
  const visible = matches.slice((page - 1) * 12, page * 12);
  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Governance, delegated"
        title="Who carries the vote?"
        detail="Find a representative by name or on-chain identity."
        symbol="◈"
      />
      <section
        className="directory-filter-bar"
        aria-label="DRep directory filters"
      >
        <label className="directory-search">
          <span className="eyebrow">Find a representative</span>
          <span className="directory-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Search DReps"
              placeholder="Name or DRep ID…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              autoComplete="off"
            />
          </span>
        </label>
        <div className="directory-filter-selects">
          <label>
            Status
            <select
              aria-label="Filter DReps"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="active">Active and unexpired</option>
              <option value="all">All</option>
              <option value="retired">Retired</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label>
            Credential
            <select
              aria-label="DRep credential type"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Any type</option>
              <option value="key">Key</option>
              <option value="script">Script</option>
              <option value="automatic">Automatic choices</option>
            </select>
          </label>
          <label>
            Order
            <select
              aria-label="Order DReps"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="registration">Registration order</option>
              <option value="amount">Voting power</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </section>
      <Panel
        title="DReps"
        action={
          <div className="directory-result-count">
            <span role="status" aria-live="polite">
              {matches.length.toLocaleString()}{" "}
              {matches.length === 1 ? "match" : "matches"}
              {loading || query.isError ? " in loaded DReps" : ""}
            </span>
            {active && (
              <button type="button" onClick={reset}>
                Clear filters
              </button>
            )}
          </div>
        }
      >
        {(loading || query.isError) && (
          <p className="directory-progress" role="status">
            {query.isError ? "Directory incomplete" : "Loading directory"} ·{" "}
            {rows.length.toLocaleString()} DReps loaded. Search and ordering
            update instantly as entries arrive.
          </p>
        )}
        {query.error && (
          <div role="alert" className="mb-4 text-sm text-red-400">
            {query.error.message}
            <button
              type="button"
              className="ml-3 text-sky-300"
              onClick={() =>
                void (query.hasNextPage
                  ? query.fetchNextPage()
                  : query.refetch())
              }
            >
              Retry directory
            </button>
          </div>
        )}
        {!matches.length && !query.isPending && (
          <div className="list-empty">
            <span aria-hidden="true">⌕</span>
            <p>
              {loading || query.isError
                ? "No matches in the DReps loaded so far."
                : "No DReps match these filters."}
            </p>
            {active && (
              <button type="button" onClick={reset}>
                Clear filters
              </button>
            )}
          </div>
        )}
        {visible.length > 0 && (
          <div className="drep-power-chart">
            <span className="eyebrow">
              Voting power · representatives on this page
            </span>
            <BarChart
              title="ADA voting power"
              items={visible.map((row) => ({
                label: drepName(row),
                value: Number(BigInt(row.amount)) / 1_000_000,
                href: `/explorer/drep/${row.drep_id}`,
              }))}
            />
          </div>
        )}
        <div className="drep-results">
          {visible.map((row) => (
            <DRepCard key={row.drep_id} row={row} />
          ))}
        </div>
        <Pagination
          page={page}
          onPageChange={setPage}
          hasNextPage={page * 12 < matches.length}
        />
      </Panel>
    </div>
  );
}
