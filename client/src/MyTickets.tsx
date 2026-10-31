import { useEffect, useState } from 'react'
import {
  fetchCategories,
  fetchTickets,
  type Category,
  type Priority,
  type SortBy,
  type SortDir,
  type TicketListItem,
  type TicketListResponse,
} from './api'
import { PriorityBadge, StatusBadge } from './badges'
import { formatDate } from './dateFormat'
import PaginationControls from './PaginationControls'
import type { PageSize } from './pageSizes'

// The Current Status options besides All Statuses (docs/lab-04/ui-spec.md
// §10). `open` stands for the five statuses of the Open Tickets metric
// (BR-29), which go to the API as a list.
const CURRENT_STATUSES = ['NEW', 'open', 'WAITING_FOR_REQUESTER'] as const
const CURRENT_STATUS_LABELS: Record<(typeof CURRENT_STATUSES)[number], string> = {
  NEW: 'New',
  open: 'Open Tickets',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
}
const OPEN_TICKET_STATUSES = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED'

interface Filters {
  search: string
  categoryId: string
  requestedPriority: Priority | ''
  itPriority: Priority | ''
  currentStatus: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  categoryId: '',
  requestedPriority: '',
  itPriority: '',
  currentStatus: '',
}

type ListState =
  | { status: 'loading' }
  | { status: 'success'; response: TicketListResponse }
  | { status: 'error'; message: string }

// The My Tickets list (ui-spec.md §8, ticket #20): paginated, searchable,
// filterable, sortable list of the selected Requester's own Tickets.
function MyTickets({
  initialCurrentStatus = '',
  onCreateTicket,
  onOpenTicket,
}: {
  // The filter the URL opened the screen with. A value the select does not
  // list is ignored.
  initialCurrentStatus?: string
  onCreateTicket: () => void
  onOpenTicket: (ticketId: number) => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    currentStatus: (CURRENT_STATUSES as readonly string[]).includes(initialCurrentStatus) ? initialCurrentStatus : '',
  })
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [list, setList] = useState<ListState>({ status: 'loading' })

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {
        // The category filter dropdown just stays empty; the list itself
        // still loads (categoryId filtering doesn't require this).
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setList({ status: 'loading' })

    fetchTickets({
      page,
      pageSize,
      search: filters.search.trim() || undefined,
      categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
      requestedPriority: filters.requestedPriority || undefined,
      itPriority: filters.itPriority || undefined,
      currentStatus: filters.currentStatus === 'open' ? OPEN_TICKET_STATUSES : filters.currentStatus || undefined,
      sortBy,
      sortDir,
    })
      .then((response) => {
        if (!cancelled) setList({ status: 'success', response })
      })
      .catch((err) => {
        if (!cancelled) {
          setList({ status: 'error', message: err instanceof Error ? err.message : 'Unable to load tickets' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [filters, sortBy, sortDir, page, pageSize])

  const isFiltering = Boolean(
    filters.search.trim() ||
      filters.categoryId ||
      filters.requestedPriority ||
      filters.itPriority ||
      filters.currentStatus,
  )

  const updateFilter = (field: keyof Filters, value: string) => {
    setPage(1) // AC-21: changing a filter/search returns to the first page
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const clearFilters = () => {
    setPage(1)
    setFilters(EMPTY_FILTERS)
  }

  const toggleSort = (field: SortBy) => {
    setPage(1)
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  const sortIndicator = (field: SortBy) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  const categoryName = (categoryId: number) => categories.find((c) => c.id === categoryId)?.name ?? '—'

  return (
    <div className="my-tickets container py-5">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h3 mb-1">My Tickets</h1>
          <p className="text-muted mb-0">Tickets you've submitted, and their current status.</p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-link text-decoration-none" onClick={clearFilters}>
            Clear Filters
          </button>
          <button type="button" className="btn btn-primary" onClick={onCreateTicket}>
            Create Ticket
          </button>
        </div>
      </div>

      <div className="row g-2 mb-4">
        <div className="col-12 col-md-4">
          <label htmlFor="my-tickets-search" className="visually-hidden">
            Search
          </label>
          <input
            id="my-tickets-search"
            type="search"
            className="form-control"
            placeholder="Search by ticket number or summary…"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="my-tickets-category" className="visually-hidden">
            Category
          </label>
          <select
            id="my-tickets-category"
            className="form-select"
            value={filters.categoryId}
            onChange={(e) => updateFilter('categoryId', e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="my-tickets-requested-priority" className="visually-hidden">
            Requested Priority
          </label>
          <select
            id="my-tickets-requested-priority"
            className="form-select"
            value={filters.requestedPriority}
            onChange={(e) => updateFilter('requestedPriority', e.target.value)}
          >
            <option value="">All Requested Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="my-tickets-it-priority" className="visually-hidden">
            IT Priority
          </label>
          <select
            id="my-tickets-it-priority"
            className="form-select"
            value={filters.itPriority}
            onChange={(e) => updateFilter('itPriority', e.target.value)}
          >
            <option value="">All IT Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="my-tickets-status" className="visually-hidden">
            Current Status
          </label>
          <select
            id="my-tickets-status"
            className="form-select"
            value={filters.currentStatus}
            onChange={(e) => updateFilter('currentStatus', e.target.value)}
          >
            <option value="">All Statuses</option>
            {CURRENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CURRENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.status === 'loading' && <p role="status">⏳ Loading tickets…</p>}
      {list.status === 'error' && (
        <p className="text-danger" role="alert">
          {list.message}
        </p>
      )}

      {list.status === 'success' && list.response.data.length === 0 && !isFiltering && (
        <div className="text-center py-5 border rounded">
          <p className="mb-3">You haven't submitted any tickets yet.</p>
          <button type="button" className="btn btn-primary" onClick={onCreateTicket}>
            Create Ticket
          </button>
        </div>
      )}

      {list.status === 'success' && list.response.data.length === 0 && isFiltering && (
        <div className="text-center py-5 border rounded">
          <p className="mb-3">No tickets match your search or filters.</p>
          <button type="button" className="btn btn-outline-primary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {list.status === 'success' && list.response.data.length > 0 && (
        <>
          {/* Desktop/tablet table (ui-spec.md §8) */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col" role="button" onClick={() => toggleSort('ticketNumber')}>
                    Ticket No.{sortIndicator('ticketNumber')}
                  </th>
                  <th scope="col" role="button" onClick={() => toggleSort('createdAt')}>
                    Created Date{sortIndicator('createdAt')}
                  </th>
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Category
                  </th>
                  <th scope="col">Requested Priority</th>
                  <th scope="col">IT Priority</th>
                  <th scope="col">Current Status</th>
                  <th scope="col" role="button" onClick={() => toggleSort('updatedAt')}>
                    Last Updated{sortIndicator('updatedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.response.data.map((ticket: TicketListItem) => (
                  <tr
                    key={ticket.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTicket(ticket.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenTicket(ticket.id)
                      }
                    }}
                  >
                    <td>{ticket.ticketNumber}</td>
                    <td>{formatDate(ticket.createdAt)}</td>
                    <td>{ticket.summary}</td>
                    <td className="d-none d-lg-table-cell">{categoryName(ticket.categoryId)}</td>
                    <td>
                      <PriorityBadge priority={ticket.requestedPriority} />
                    </td>
                    <td>
                      <PriorityBadge priority={ticket.itPriority} />
                    </td>
                    <td>
                      <StatusBadge status={ticket.currentStatus} />
                    </td>
                    <td>{formatDate(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (ui-spec.md §8) */}
          <ul className="list-unstyled d-flex flex-column gap-2 d-md-none">
            {list.response.data.map((ticket: TicketListItem) => (
              <li
                key={ticket.id}
                role="button"
                tabIndex={0}
                className="border rounded p-3"
                onClick={() => onOpenTicket(ticket.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenTicket(ticket.id)
                  }
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fw-semibold">{ticket.ticketNumber}</span>
                  <StatusBadge status={ticket.currentStatus} />
                </div>
                <p className="mb-2">{ticket.summary}</p>
                <div className="d-flex flex-wrap gap-2 small text-muted align-items-center">
                  <span>{categoryName(ticket.categoryId)}</span>
                  <PriorityBadge priority={ticket.requestedPriority} />
                  <span>Updated {formatDate(ticket.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>

          <PaginationControls
            meta={list.response.meta}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(next) => {
              setPage(1)
              setPageSize(next)
            }}
          />
        </>
      )}
    </div>
  )
}

export default MyTickets
