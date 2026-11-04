import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { QueryState } from "./QueryState";
import { Pagination } from "./Pagination";

interface PaginatedListProps<T> {
  queryKey: unknown[];
  pageSize?: number;
  visualize?: (items: T[]) => ReactNode;
  staleTime?: number;
  buildUrl: (page: number, pageSize: number) => string;
  renderItem: (item: T) => ReactNode;
  emptyLabel?: string;
  keyFor: (item: T, index: number) => string | number;
}

export function PaginatedList<T>(props: PaginatedListProps<T>) {
  return (
    <PaginatedListPage
      key={JSON.stringify([props.queryKey, props.pageSize ?? 20])}
      {...props}
    />
  );
}

function PaginatedListPage<T>({
  queryKey,
  pageSize = 20,
  buildUrl,
  renderItem,
  emptyLabel = "Nothing here yet.",
  keyFor,
  visualize,
  staleTime,
}: PaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...queryKey, pageSize, page],
    queryFn: ({ signal }) =>
      blockfrostFetch<T[]>(buildUrl(page, pageSize), { signal }),
    staleTime,
  });

  return (
    <>
      <QueryState
        hasData={query.data !== undefined}
        isLoading={query.isLoading}
        error={query.error}
      >
        {query.data?.length === 0 && (
          <div className="list-empty">
            <span aria-hidden="true">◇</span>
            <p>{page > 1 ? "No more results." : emptyLabel}</p>
          </div>
        )}
        {query.data && query.data.length > 0 && visualize?.(query.data)}
        <ul className="activity-list">
          {query.data?.map((item, index) => (
            <li key={keyFor(item, index)}>{renderItem(item)}</li>
          ))}
        </ul>
      </QueryState>
      <Pagination
        page={page}
        onPageChange={setPage}
        hasNextPage={(query.data?.length ?? 0) === pageSize}
      />
    </>
  );
}
