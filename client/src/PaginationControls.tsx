import { useId } from 'react'
import type { TicketListResponse } from './api'
import { PAGE_SIZES, type PageSize } from './pageSizes'

// The pagination control shared by My Tickets and the Ticket Queue
// (docs/lab-03/ui-spec.md §1, §8.2): the result caption, the page-size
// select, and Previous and Next around the page number.
function PaginationControls({
  meta,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  meta: TicketListResponse['meta']
  onPageChange: (page: number) => void
  pageSize: PageSize
  onPageSizeChange: (pageSize: PageSize) => void
}) {
  const pageSizeId = useId()
  const from = (meta.page - 1) * meta.pageSize + 1
  const to = Math.min(meta.page * meta.pageSize, meta.totalItems)

  return (
    <nav
      className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"
      aria-label="Ticket list pagination"
    >
      <span className="text-muted small">
        Showing {from} to {to} of {meta.totalItems} tickets
      </span>
      <div className="d-flex align-items-center gap-2">
        <label htmlFor={pageSizeId} className="visually-hidden">
          Tickets per page
        </label>
        <select
          id={pageSizeId}
          className="form-select form-select-sm w-auto"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </button>
        <span className="small">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={meta.page >= Math.max(meta.totalPages, 1)}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

export default PaginationControls
