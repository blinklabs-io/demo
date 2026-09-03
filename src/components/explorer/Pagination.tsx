export function Pagination({
  page,
  onPageChange,
  hasNextPage,
}: {
  page: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-slate-500">Page {page}</span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNextPage}
        className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
