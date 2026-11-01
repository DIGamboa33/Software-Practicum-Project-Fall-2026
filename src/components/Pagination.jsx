function Pagination({
  currentPage,
  itemLabel = "entries",
  onPageChange,
  onPageSizeChange,
  pageSize,
  pageSizeOptions = [5, 10, 20, 50],
  totalItems,
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const firstItem = totalItems ? (safePage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(safePage * pageSize, totalItems);

  return (
    <nav aria-label={`${itemLabel} pagination`} className="pagination-controls">
      <p className="pagination-summary">
        {totalItems > pageSize
          ? `${firstItem}–${lastItem} of ${totalItems}`
          : totalItems} {itemLabel}
      </p>
      <div>
        {onPageSizeChange && (
          <label className="pagination-page-size">
            <span>Rows</span>
            <select
              aria-label={`Rows per page for ${itemLabel}`}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              value={pageSize}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        {totalItems > pageSize && (
          <>
            <button disabled={safePage === 1} onClick={() => onPageChange(safePage - 1)} type="button">Previous</button>
            <span>Page {safePage} of {pageCount}</span>
            <button disabled={safePage === pageCount} onClick={() => onPageChange(safePage + 1)} type="button">Next</button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Pagination;
