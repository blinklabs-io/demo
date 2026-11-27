import { LazyDisclosure } from "../../components/explorer/LazyDisclosure";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Link } from "../../components/NetworkLink";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { compactAda } from "../../lib/visualFormat";
import { PageIntro } from "../../components/explorer/Visuals";
import { Icon } from "../../components/Icon";
import {
  PoolIdentity,
  type PoolMetadata,
} from "../../components/explorer/PoolIdentity";
import { Pagination } from "../../components/explorer/Pagination";
import { Panel } from "../../components/explorer/Panel";
import { HashLink } from "../../components/explorer/HashLink";
import { PaginatedList } from "../../components/explorer/PaginatedList";

interface PoolExtendedRow {
  pool_id: string;
  metadata?: PoolMetadata | null;
  active_stake: string;
  live_stake: string;
  blocks_minted: number;
  live_saturation: number;
  margin_cost: number;
}

function PoolTable({ rows }: { rows: PoolExtendedRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="data-table pool-table">
        <thead>
          <tr>
            <th>Pool</th>
            <th className="num">Live stake</th>
            <th>Saturation</th>
            <th className="num">Blocks minted</th>
            <th className="num">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const saturation = row.live_saturation * 100;
            return (
              <tr key={row.pool_id}>
                <td>
                  <PoolIdentity poolId={row.pool_id} metadata={row.metadata} />
                </td>
                <td className="num">{compactAda(row.live_stake)}</td>
                <td>
                  <span
                    className="inline-meter"
                    data-over={saturation > 100 || undefined}
                    title={saturation > 100 ? "Oversaturated" : undefined}
                  >
                    <span
                      role="meter"
                      aria-label="Saturation"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round(saturation))}
                    >
                      <i style={{ width: `${Math.min(100, saturation)}%` }} />
                    </span>
                    {saturation.toFixed(1)}%
                  </span>
                </td>
                <td className="num">{row.blocks_minted.toLocaleString()}</td>
                <td className="num">{(row.margin_cost * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PoolRetiringRow {
  pool_id: string;
  epoch: number;
}

function usePoolDirectory() {
  const query = useInfiniteQuery({
    queryKey: ["dingo", "pool-directory"],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<PoolExtendedRow[]>(
        `/api/v0/pools/extended?page=${pageParam}&count=100`,
        { signal },
      ),
    getNextPageParam: (lastPage, _pages, lastParam) =>
      lastPage.length === 100 ? lastParam + 1 : undefined,
    staleTime: 300_000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isError]);
  return query;
}

export default function PoolList() {
  const [params] = useSearchParams();
  const ticker = params.get("ticker")?.trim().toUpperCase();
  return ticker ? <PoolTickerResults ticker={ticker} /> : <PoolDirectory />;
}

function PoolDirectory() {
  const query = usePoolDirectory();
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("all");
  const [saturation, setSaturation] = useState("all");
  const [sort, setSort] = useState("stake");
  const [page, setPage] = useState(1);
  const pools = useMemo(
    () => [
      ...new Map(
        (query.data?.pages.flat() ?? []).map((pool) => [pool.pool_id, pool]),
      ).values(),
    ],
    [query.data],
  );
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pools
      .filter(
        (pool) =>
          (!needle ||
            [pool.pool_id, pool.metadata?.ticker, pool.metadata?.name].some(
              (value) => value?.toLowerCase().includes(needle),
            )) &&
          (activity !== "stake" || BigInt(pool.live_stake) > 0n) &&
          (activity !== "blocks" || pool.blocks_minted > 0) &&
          (saturation !== "below" || pool.live_saturation < 1) &&
          (saturation !== "full" || pool.live_saturation >= 1),
      )
      .sort((a, b) => {
        let order: number;
        if (sort === "stake") {
          const left = BigInt(a.live_stake),
            right = BigInt(b.live_stake);
          order = left > right ? -1 : left < right ? 1 : 0;
        } else if (sort === "blocks") order = b.blocks_minted - a.blocks_minted;
        else if (sort === "margin") order = a.margin_cost - b.margin_cost;
        else
          order = (a.metadata?.ticker ?? a.pool_id).localeCompare(
            b.metadata?.ticker ?? b.pool_id,
          );
        return order || a.pool_id.localeCompare(b.pool_id);
      });
  }, [pools, search, activity, saturation, sort]);
  const loading =
    !query.isError &&
    (query.isPending || query.hasNextPage || query.isFetchingNextPage);
  const active = Boolean(
    search || activity !== "all" || saturation !== "all" || sort !== "stake",
  );
  const reset = () => {
    setSearch("");
    setActivity("all");
    setSaturation("all");
    setSort("stake");
    setPage(1);
  };
  const pageSize = 20;
  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Stake pools"
        detail="Search registered stake pools by ticker, name, or pool ID."
        action={
          <div className="page-actions">
            <Link className="experience-primary" to="/wallet/delegate">Delegate your stake</Link>
          </div>
        }
      />
      <section
        className="directory-filter-bar"
        aria-label="Pool directory filters"
      >
        <label className="directory-search">
          <span className="eyebrow">Find a pool</span>
          <span className="directory-search-field">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search stake pools"
              placeholder="Ticker, name, or pool ID…"
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
            Activity
            <select
              aria-label="Pool activity"
              value={activity}
              onChange={(event) => {
                setActivity(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All pools</option>
              <option value="stake">With live stake</option>
              <option value="blocks">Have minted blocks</option>
            </select>
          </label>
          <label>
            Saturation
            <select
              aria-label="Pool saturation"
              value={saturation}
              onChange={(event) => {
                setSaturation(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Any saturation</option>
              <option value="below">Below 100%</option>
              <option value="full">100% or above</option>
            </select>
          </label>
          <label>
            Sort by
            <select
              aria-label="Sort pools"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="stake">Highest live stake</option>
              <option value="blocks">Most blocks minted</option>
              <option value="margin">Lowest margin</option>
              <option value="ticker">Ticker A–Z</option>
            </select>
          </label>
        </div>
      </section>
      <Panel
        title="Stake pools"
        action={
          <div className="directory-result-count">
            <span role="status" aria-live="polite">
              {matches.length.toLocaleString()}{" "}
              {matches.length === 1 ? "match" : "matches"}
              {loading || query.isError ? " in loaded pools" : ""}
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
            {pools.length.toLocaleString()} pools loaded
            {!query.isError && ". Filtering available pools instantly."}
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
            <p>
              {loading || query.isError
                ? "No matches in the pools loaded so far."
                : "No pools match these filters."}
            </p>
            {active && (
              <button type="button" onClick={reset}>
                Clear filters
              </button>
            )}
          </div>
        )}
        <PoolTable
          rows={matches.slice((page - 1) * pageSize, page * pageSize)}
        />
        <Pagination
          page={page}
          onPageChange={setPage}
          hasNextPage={page * pageSize < matches.length}
        />
      </Panel>
      <LazyDisclosure title="Retiring pools">
        <Panel title="Retiring pools">
          <PaginatedList<PoolRetiringRow>
            queryKey={["dingo", "pools", "retiring"]}
            buildUrl={(page, count) =>
              `/api/v0/pools/retiring?page=${page}&count=${count}`
            }
            keyFor={(row) => row.pool_id}
            emptyLabel="No pools are retiring."
            renderItem={(row) => (
              <span>
                <HashLink kind="pool" id={row.pool_id} /> retiring at epoch{" "}
                {row.epoch}
              </span>
            )}
          />
        </Panel>
      </LazyDisclosure>
    </div>
  );
}

function PoolTickerResults({ ticker }: { ticker: string }) {
  const query = usePoolDirectory();
  const pools = query.data?.pages.flat() ?? [];
  const matches = pools.filter(
    (pool) => pool.metadata?.ticker?.toUpperCase() === ticker,
  );
  const searching =
    !query.isError &&
    (query.isPending || query.isFetchingNextPage || query.hasNextPage);
  return (
    <div className="flex flex-col gap-4">
      <div className="page-intro">
        <div>
          <h1>Pools matching {ticker}</h1>
          <p>
            Matching registered tickers on this network. Tickers may be shared
            by multiple pools.
          </p>
        </div>
        <Link className="button-secondary" to="/explorer/pools">
          All pools
        </Link>
      </div>
      <Panel title={`${matches.length} matching pools`}>
        {query.error && (
          <div role="alert" className="mb-4 text-sm text-red-400">
            <p>Directory incomplete: {query.error.message}</p>
            <button
              type="button"
              className="mt-2 text-xs text-teal-300"
              disabled={query.isFetching}
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
        {searching && (
          <p role="status" className="mb-6 text-xs text-slate-400">
            Searching pool metadata… {pools.length.toLocaleString()} pools
            checked.
          </p>
        )}
        {!searching && !query.error && !matches.length && (
          <p className="text-sm text-slate-400">
            No indexed pool metadata matches this ticker.
          </p>
        )}
        <PoolTable rows={matches} />
      </Panel>
    </div>
  );
}
