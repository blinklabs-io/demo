export function Pagination({
  page,
  onPageChange,
  hasNextPage,
}: {
  page: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
}) {
  if (page === 1 && !hasNextPage) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="button-secondary"
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNextPage}
        className="button-secondary"
      >
        Next
      </button>
    </div>
  );
}
