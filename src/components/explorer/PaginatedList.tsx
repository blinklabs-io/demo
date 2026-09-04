import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { blockfrostFetch } from "../../lib/dingo/blockfrost";
import { QueryState } from "./QueryState";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;

interface PaginatedListProps<T> {
  queryKey: unknown[];
  buildUrl: (page: number, pageSize: number) => string;
  renderItem: (item: T) => ReactNode;
  emptyLabel?: string;
  keyFor: (item: T, index: number) => string | number;
}

export function PaginatedList<T>(props: PaginatedListProps<T>) {
  return (
    <PaginatedListPage
      key={JSON.stringify(props.queryKey)}
      {...props}
    />
  );
}

function PaginatedListPage<T>({
  queryKey,
  buildUrl,
  renderItem,
  emptyLabel = "Nothing here yet.",
  keyFor,
}: PaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () => blockfrostFetch<T[]>(buildUrl(page, PAGE_SIZE)),
  });

  return (
    <QueryState isLoading={query.isLoading} error={query.error}>
      {query.data?.length === 0 && (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      )}
      <ul className="flex flex-col gap-1 text-sm">
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
