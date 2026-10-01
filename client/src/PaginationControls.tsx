import { useId } from 'react'
import type { TicketListResponse } from './api'
import { PAGE_SIZES, type PageSize } from './pageSizes'

// Up to this many pages, every page number is shown.
const EVERY_PAGE_UP_TO = 7
const GAP = 'gap'

// The page numbers to offer: every page while there are few, otherwise the
// first, the last, and the current page with its neighbours, with a gap
// where pages are left out. A gap of a single page shows that page.
function pageWindow(current: number, last: number): Array<number | typeof GAP> {
  const all = Array.from({ length: last }, (_, index) => index + 1)
  if (last <= EVERY_PAGE_UP_TO) return all

  const shown = all.filter((page) => page === 1 || page === last || Math.abs(page - current) <= 1)

  return shown.flatMap((page, index) => {
    const skipped = page - (shown[index - 1] ?? 0) - 1
    return skipped === 0 ? [page] : skipped === 1 ? [page - 1, page] : [GAP, page]
  })
}

// The pagination control shared by My Tickets and the Ticket Queue
// (docs/lab-03/ui-spec.md §1, §8.2): the result caption, the page-size
// select, and Previous, the page numbers, and Next.
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
  const lastPage = Math.max(meta.totalPages, 1)

  return (
    <nav
      className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3"
      aria-label="Ticket list pagination"
    >
      <span className="text-muted small">
        Showing {from} to {to} of {meta.totalItems} tickets
      </span>
      <div className="d-flex flex-wrap align-items-center gap-2">
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
        <ol className="tk-pagination__pages">
          {pageWindow(meta.page, lastPage).map((page, index) =>
            page === GAP ? (
              <li key={`gap-${index}`} className="tk-pagination__gap">
                …
              </li>
            ) : (
              <li key={page}>
                <button
                  type="button"
                  className={`btn btn-sm tk-pagination__page ${page === meta.page ? 'btn-primary' : 'btn-outline-secondary'}`}
                  aria-label={`Page ${page}`}
                  aria-current={page === meta.page ? 'page' : undefined}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={meta.page >= lastPage}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

export default PaginationControls
