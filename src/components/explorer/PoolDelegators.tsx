import { useInfiniteQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { formatAda } from "../../lib/format";
import { Panel } from "./Panel";
import { QueryState } from "./QueryState";
import { HashLink } from "./HashLink";
interface Delegator {
  address: string;
  live_stake: string;
}
export function PoolDelegators({ poolId }: { poolId: string }) {
  const query = useInfiniteQuery({
    queryKey: ["dingo", "pool", poolId, "delegators"],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      blockfrostFetch<Delegator[]>(
        `/api/v0/pools/${poolId}/delegators?count=20&page=${pageParam}&order=asc`,
        { signal },
      ),
    getNextPageParam: (last, pages) =>
      last.length === 20 ? pages.length + 1 : undefined,
    staleTime: 60000,
  });
  const rows = query.data?.pages.flat() ?? [];
  return (
    <Panel title="Delegators">
      <QueryState
        hasData={query.data !== undefined}
        isLoading={query.isLoading}
        error={query.error}
      >
        <div className="pool-delegators">
          {rows.map((row) => (
            <div className="pool-delegator" key={row.address}>
              <HashLink kind="account" id={row.address} full />
              <strong>{formatAda(BigInt(row.live_stake))}</strong>
            </div>
          ))}
        </div>
        {query.data && !rows.length && (
          <p className="tool-help">No current delegators.</p>
        )}
        {query.data && (
          <p className="pool-relay-note">
            Showing {rows.length.toLocaleString()} delegators · current
            delegated stake
          </p>
        )}
        {query.hasNextPage && (
          <button
            className="experience-primary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load 20 more delegators"}
          </button>
        )}
      </QueryState>
    </Panel>
  );
}
