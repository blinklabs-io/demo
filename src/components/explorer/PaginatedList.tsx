import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { QueryState } from "./QueryState";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;

interface PaginatedListProps<T> {
  queryKey: unknown[];
  visualize?: (items: T[]) => ReactNode;
  staleTime?: number;
  buildUrl: (page: number, pageSize: number) => string;
  renderItem: (item: T) => ReactNode;
  emptyLabel?: string;
  keyFor: (item: T, index: number) => string | number;
}

export function PaginatedList<T>(props: PaginatedListProps<T>) {
  return <PaginatedListPage key={JSON.stringify(props.queryKey)} {...props} />;
}

function PaginatedListPage<T>({
  queryKey,
  buildUrl,
  renderItem,
  emptyLabel = "Nothing here yet.",
  keyFor,
  visualize,
  staleTime,
}: PaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: ({ signal }) =>
      blockfrostFetch<T[]>(buildUrl(page, PAGE_SIZE), { signal }),
    staleTime,
  });

  return (
    <QueryState isLoading={query.isLoading} error={query.error}>
      {query.data?.length === 0 && (
        <div className="list-empty">
          <span aria-hidden="true">◇</span>
          <p>{emptyLabel}</p>
        </div>
      )}
      {query.data && query.data.length > 0 && visualize?.(query.data)}
      <ul className="activity-list">
        {query.data?.map((item, index) => (
          <li key={keyFor(item, index)}>{renderItem(item)}</li>
        ))}
      </ul>
      <Pagination
        page={page}
        onPageChange={setPage}
        hasNextPage={(query.data?.length ?? 0) === PAGE_SIZE}
      />
    </QueryState>
  );
}
