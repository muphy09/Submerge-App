import './TablePagination.css';

type TablePaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
};

function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
}: TablePaginationProps) {
  return (
    <nav className="proposal-table-pagination" aria-label="Proposal table pages">
      <span className="proposal-table-pagination-range">
        {totalItems === 0 ? '0 proposals' : `${startIndex + 1}–${endIndex} of ${totalItems} proposals`}
      </span>
      <span className="proposal-table-pagination-page" aria-live="polite">Page {currentPage} of {totalPages}</span>
      <div className="proposal-table-pagination-actions">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Previous Page
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next Page
        </button>
      </div>
    </nav>
  );
}

export default TablePagination;
