type PagerProps = {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
};

/** Page stepper shared by the ranking and history lists. */
export function Pager({ page, totalPages, onPage }: PagerProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="pager">
      <button
        type="button"
        className="btn btn--text"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="pager__status" role="status">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn--text"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
