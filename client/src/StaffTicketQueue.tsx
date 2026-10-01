import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ApiError,
  fetchCategories,
  fetchEligibleOwners,
  fetchStaffQueue,
  type Category,
  type EligibleOwner,
  type Priority,
  type QueueParams,
  type QueueResponse,
  type QueueSortBy,
  type QueueTicket,
  type SortDir,
  type TicketStatus,
  type UserIdentity,
} from './api'
import { AppearsResolvedBadge, PriorityBadge, StatusBadge } from './badges'
import { ForbiddenPage, InlineAlert, SAFE_FAILURE_MESSAGE } from './feedback'
import PaginationControls from './PaginationControls'
import { PAGE_SIZES, type PageSize } from './pageSizes'

const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
}
const STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[]
// Every status except Closed and Cancelled.
const UNFINISHED = STATUSES.filter((status) => status !== 'CLOSED' && status !== 'CANCELLED')

const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[]

const SORT_LABELS: Record<QueueSortBy, string> = {
  updatedAt: 'Last Updated',
  createdAt: 'Created Date',
  ticketNumber: 'Ticket No.',
  itPriority: 'IT Priority',
}
const SORT_FIELDS = Object.keys(SORT_LABELS) as QueueSortBy[]

const SEARCH_DELAY_MS = 300

// What the screen is showing: the value of every control and the page
// (ui-spec.md §8.2).
interface View {
  search: string
  status: 'unfinished' | 'all' | TicketStatus
  owner: 'any' | 'unassigned' | 'me' | number
  itPriority: Priority | ''
  categoryId: number | null
  appearsResolved: boolean
  sortBy: QueueSortBy
  sortDir: SortDir
  page: number
  pageSize: PageSize
}

const DEFAULT_VIEW: View = {
  search: '',
  status: 'unfinished',
  owner: 'any',
  itPriority: '',
  categoryId: null,
  appearsResolved: false,
  sortBy: 'updatedAt',
  sortDir: 'desc',
  page: 1,
  pageSize: 10,
}

function oneOf<T extends string>(choices: readonly T[], value: string | null): T | undefined {
  return choices.find((choice) => choice === value)
}

function positiveInteger(value: string | null): number | undefined {
  return value !== null && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
}

// The view a URL query describes. A value that is not one of a control's
// choices leaves that control at its default.
function readView(params: URLSearchParams): View {
  const owner = params.get('owner')
  const pageSize = positiveInteger(params.get('pageSize'))

  return {
    search: (params.get('search') ?? '').trim().slice(0, 100),
    status: oneOf(['all', ...STATUSES] as const, params.get('status')) ?? DEFAULT_VIEW.status,
    owner: oneOf(['unassigned', 'me'] as const, owner) ?? positiveInteger(owner) ?? DEFAULT_VIEW.owner,
    itPriority: oneOf(PRIORITIES, params.get('itPriority')) ?? DEFAULT_VIEW.itPriority,
    categoryId: positiveInteger(params.get('categoryId')) ?? DEFAULT_VIEW.categoryId,
    appearsResolved: params.get('appearsResolved') === 'true',
    sortBy: oneOf(SORT_FIELDS, params.get('sortBy')) ?? DEFAULT_VIEW.sortBy,
    sortDir: oneOf(['asc', 'desc'] as const, params.get('sortDir')) ?? DEFAULT_VIEW.sortDir,
    page: positiveInteger(params.get('page')) ?? DEFAULT_VIEW.page,
    pageSize: PAGE_SIZES.find((size) => size === pageSize) ?? DEFAULT_VIEW.pageSize,
  }
}

// The URL query of a view: only what differs from the default, so the
// default view is the bare path.
function writeView(view: View): URLSearchParams {
  const params = new URLSearchParams()

  for (const key of Object.keys(DEFAULT_VIEW) as Array<keyof View>) {
    if (view[key] !== DEFAULT_VIEW[key]) params.set(key, String(view[key]))
  }

  return params
}

// What GET /api/staff/tickets is asked for a view.
function toRequest(view: View): QueueParams {
  return {
    page: view.page,
    pageSize: view.pageSize,
    search: view.search || undefined,
    status: view.status === 'all' ? undefined : view.status === 'unfinished' ? UNFINISHED : [view.status],
    owner: view.owner === 'any' ? undefined : view.owner,
    itPriority: view.itPriority || undefined,
    categoryId: view.categoryId ?? undefined,
    appearsResolved: view.appearsResolved || undefined,
    sortBy: view.sortBy,
    sortDir: view.sortDir,
  }
}

// How a request for the queue ended (ui-spec.md §8.3).
type Outcome = { status: 'loaded'; response: QueueResponse } | { status: 'failed' } | { status: 'forbidden' }

// How many of the five filters are not at their default.
function countActiveFilters(view: View): number {
  const filters = ['status', 'owner', 'itPriority', 'categoryId', 'appearsResolved'] as const
  return filters.filter((filter) => view[filter] !== DEFAULT_VIEW[filter]).length
}

// Every control at its default: what tells Empty from No results.
function isDefaultView(view: View): boolean {
  return writeView({ ...view, page: DEFAULT_VIEW.page }).toString() === ''
}

const SKELETON_ROWS = 5

// Last Updated: the date and the time, which may sit on two lines in a
// narrow column but are never broken inside.
function DateTime({ iso }: { iso: string }) {
  const at = new Date(iso)

  return (
    <>
      <span className="text-nowrap">
        {at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </span>{' '}
      <span className="text-nowrap">{at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
    </>
  )
}

const detailPath = (ticket: QueueTicket) => `/staff/tickets/${ticket.id}`

function Owner({ ticket }: { ticket: QueueTicket }) {
  return ticket.owner ? <span>{ticket.owner.name}</span> : <span className="tk-queue__unassigned">Unassigned</span>
}

// The IT Staff Ticket Queue (docs/lab-03/ui-spec.md §8): the Tickets of
// every Requester, for IT Staff and Administrators.
function StaffTicketQueue({ user }: { user: UserIdentity }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [owners, setOwners] = useState<EligibleOwner[]>([])
  // The outcome of the request named by `key`, and how many times Retry
  // has asked again.
  const [result, setResult] = useState<{ key: string; outcome: Outcome } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The view lives in the URL query, so Back from Ticket Detail returns to
  // it (ui-spec.md §8.2). `viewKey` is the same for two URLs that describe
  // the same view.
  const view = readView(searchParams)
  const viewKey = writeView(view).toString()

  // Changing the search, a filter, the sort, or the page size returns to
  // page 1.
  const show = (changes: Partial<View>) => {
    setSearchParams(writeView({ ...view, page: 1, ...changes }), { replace: true })
  }

  // What is typed in Search, which is applied 300ms after typing stops or
  // on Enter.
  const [searchText, setSearchText] = useState(view.search)
  const [appliedSearch, setAppliedSearch] = useState(view.search)
  const searchTimer = useRef<number | undefined>(undefined)

  // The applied search changed. When that came from outside the input
  // (Clear Filters), the input follows it.
  if (appliedSearch !== view.search) {
    setAppliedSearch(view.search)
    if (searchText.trim() !== view.search) setSearchText(view.search)
  }

  useEffect(() => () => window.clearTimeout(searchTimer.current), [])

  const applySearch = (text: string) => {
    window.clearTimeout(searchTimer.current)
    if (text.trim() !== view.search) show({ search: text.trim() })
  }

  const typeSearch = (text: string) => {
    setSearchText(text)
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => applySearch(text), SEARCH_DELAY_MS)
  }

  useEffect(() => {
    // Without them the Owner and Category selects offer fewer choices; the
    // queue itself still loads.
    fetchCategories()
      .then(setCategories)
      .catch(() => {})
    fetchEligibleOwners()
      .then(setOwners)
      .catch(() => {})
  }, [])

  // While the outcome held is not the one of the current view, the request
  // for it is in flight.
  const requestKey = `${viewKey}#${attempt}`
  const queue = result?.key === requestKey ? result.outcome : ({ status: 'loading' } as const)

  useEffect(() => {
    let cancelled = false

    fetchStaffQueue(toRequest(readView(new URLSearchParams(viewKey))))
      .then((response): Outcome => ({ status: 'loaded', response }))
      .catch(
        (err): Outcome =>
          err instanceof ApiError && err.code === 'FORBIDDEN' ? { status: 'forbidden' } : { status: 'failed' },
      )
      .then((outcome) => {
        if (!cancelled) setResult({ key: requestKey, outcome })
      })

    return () => {
      cancelled = true
    }
  }, [viewKey, requestKey])

  // A column header sorts by its field, most first, and turns the
  // direction round when it is already the sort.
  const sortFromHeader = (field: QueueSortBy) => {
    show({ sortBy: field, sortDir: view.sortBy === field && view.sortDir === 'desc' ? 'asc' : 'desc' })
  }

  const sortableHeader = (field: QueueSortBy, className?: string) => (
    <th
      scope="col"
      className={className}
      aria-sort={view.sortBy !== field ? 'none' : view.sortDir === 'asc' ? 'ascending' : 'descending'}
    >
      <button type="button" className="btn btn-link tk-queue__sort-header" onClick={() => sortFromHeader(field)}>
        {SORT_LABELS[field]}
        {view.sortBy === field && <span aria-hidden="true">{view.sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )

  // The whole row opens Ticket Detail. The Ticket Number inside it is a
  // real link, which handles its own click and the keyboard.
  const openOnClick = (ticket: QueueTicket) => (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) return
    navigate(detailPath(ticket))
  }

  const activeFilters = countActiveFilters(view)
  const tickets = queue.status === 'loaded' ? queue.response.data : []
  const totalItems = queue.status === 'loaded' ? queue.response.meta.totalItems : 0
  const lastPage = queue.status === 'loaded' ? queue.response.meta.totalPages : 0
  // There are Tickets, but none on this page: it is past the last one
  // (the queue shrank, or the URL named it), so the last page is shown.
  const pastTheLastPage = queue.status === 'loaded' && tickets.length === 0 && totalItems > 0

  useEffect(() => {
    if (!pastTheLastPage) return

    const current = readView(new URLSearchParams(viewKey))
    setSearchParams(writeView({ ...current, page: lastPage }), { replace: true })
  }, [pastTheLastPage, lastPage, viewKey, setSearchParams])

  // ui-spec.md §2.3: the API refused the role.
  if (queue.status === 'forbidden') {
    return <ForbiddenPage role={user.role} />
  }

  return (
    <div className="tk-queue">
      <h1 className="h3 mb-3">Ticket Queue</h1>

      <div className="tk-queue__controls mb-3">
        <div className="tk-queue__search">
          <label htmlFor="queue-search" className="form-label">
            Search
          </label>
          <input
            id="queue-search"
            type="search"
            className="form-control"
            placeholder="Search by ticket number, summary, or requester…"
            maxLength={100}
            value={searchText}
            onChange={(e) => typeSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch(searchText)
            }}
          />
        </div>

        {/* Mobile: the filters sit behind this button (ui-spec.md §8.4). */}
        <button
          type="button"
          className="btn btn-outline-secondary d-md-none"
          aria-expanded={filtersOpen}
          aria-controls="queue-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
        </button>

        <div id="queue-filters" className={`tk-queue__filters${filtersOpen ? ' is-open' : ''}`}>
          <div>
            <label htmlFor="queue-status" className="form-label">
              Status
            </label>
            <select
              id="queue-status"
              className="form-select"
              value={view.status}
              onChange={(e) => show({ status: e.target.value as View['status'] })}
            >
              <option value="unfinished">Unfinished</option>
              <option value="all">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="queue-owner" className="form-label">
              Owner
            </label>
            <select
              id="queue-owner"
              className="form-select"
              value={view.owner}
              onChange={(e) => show({ owner: readView(new URLSearchParams({ owner: e.target.value })).owner })}
            >
              <option value="any">Any owner</option>
              <option value="unassigned">Unassigned</option>
              <option value="me">Assigned to me</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="queue-it-priority" className="form-label">
              IT Priority
            </label>
            <select
              id="queue-it-priority"
              className="form-select"
              value={view.itPriority}
              onChange={(e) => show({ itPriority: e.target.value as View['itPriority'] })}
            >
              <option value="">Any</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="queue-category" className="form-label">
              Category
            </label>
            <select
              id="queue-category"
              className="form-select"
              value={view.categoryId ?? ''}
              onChange={(e) => show({ categoryId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Any</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-check tk-queue__check">
            <input
              id="queue-appears-resolved"
              type="checkbox"
              className="form-check-input"
              checked={view.appearsResolved}
              onChange={(e) => show({ appearsResolved: e.target.checked })}
            />
            <label htmlFor="queue-appears-resolved" className="form-check-label">
              Requester says resolved
            </label>
          </div>
        </div>

        <div className="tk-queue__sort">
          <label htmlFor="queue-sort" className="form-label">
            Sort by
          </label>
          <div className="d-flex gap-2">
            <select
              id="queue-sort"
              className="form-select"
              value={view.sortBy}
              onChange={(e) => show({ sortBy: e.target.value as QueueSortBy })}
            >
              {SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {SORT_LABELS[field]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline-secondary text-nowrap"
              onClick={() => show({ sortDir: view.sortDir === 'asc' ? 'desc' : 'asc' })}
            >
              {view.sortDir === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </div>

        <button type="button" className="btn btn-link text-decoration-none" onClick={() => show(DEFAULT_VIEW)}>
          Clear Filters
        </button>
      </div>

      {(queue.status === 'loading' || pastTheLastPage) && (
        <div className="card tk-queue__skeleton" role="status">
          <span className="visually-hidden">Loading tickets…</span>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} className="tk-queue__skeleton-row placeholder-glow" aria-hidden="true">
              <span className="placeholder col-2" />
              <span className="placeholder col-5" />
              <span className="placeholder col-2" />
            </div>
          ))}
        </div>
      )}

      {queue.status === 'failed' && (
        <InlineAlert variant="error">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span>{SAFE_FAILURE_MESSAGE}</span>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setAttempt(attempt + 1)}>
              Retry
            </button>
          </div>
        </InlineAlert>
      )}

      {queue.status === 'loaded' && totalItems === 0 && isDefaultView(view) && (
        <div className="card tk-queue__message">
          <p className="mb-0">There are no unfinished tickets in the queue.</p>
        </div>
      )}

      {queue.status === 'loaded' && totalItems === 0 && !isDefaultView(view) && (
        <div className="card tk-queue__message">
          <p className="mb-3">No tickets match your search or filters.</p>
          <button type="button" className="btn btn-outline-primary" onClick={() => show(DEFAULT_VIEW)}>
            Clear Filters
          </button>
        </div>
      )}

      {queue.status === 'loaded' && tickets.length > 0 && (
        <>
          {/* Desktop and tablet table (ui-spec.md §8.1, §8.4) */}
          <div className="card d-none d-md-block">
            <table className="table align-middle mb-0 tk-queue__table">
              <thead>
                <tr>
                  {sortableHeader('ticketNumber')}
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Category
                  </th>
                  {sortableHeader('itPriority')}
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  {sortableHeader('updatedAt', 'd-none d-lg-table-cell')}
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="tk-queue__row" onClick={openOnClick(ticket)}>
                    <td className="text-nowrap">
                      <Link to={detailPath(ticket)}>{ticket.ticketNumber}</Link>
                    </td>
                    <td className="tk-queue__summary">
                      <div>{ticket.summary}</div>
                      <div className="text-muted small">{ticket.requester.name}</div>
                      {/* Tablet: Category and Last Updated move under the Summary. */}
                      <div className="text-muted small d-lg-none">
                        {ticket.category.name} · Updated <DateTime iso={ticket.updatedAt} />
                      </div>
                      {ticket.requesterResolvedAt && (
                        <div className="mt-1">
                          <AppearsResolvedBadge />
                        </div>
                      )}
                    </td>
                    <td className="d-none d-lg-table-cell">{ticket.category.name}</td>
                    <td>
                      <PriorityBadge priority={ticket.itPriority} />
                    </td>
                    <td>
                      <StatusBadge status={ticket.currentStatus} />
                    </td>
                    <td>
                      <Owner ticket={ticket} />
                    </td>
                    <td className="d-none d-lg-table-cell">
                      <DateTime iso={ticket.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (ui-spec.md §8.4) */}
          <ul className="list-unstyled d-flex flex-column gap-2 d-md-none mb-0">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="card tk-queue__card" onClick={openOnClick(ticket)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                    <Link to={detailPath(ticket)} className="fw-semibold">
                      {ticket.ticketNumber}
                    </Link>
                    <StatusBadge status={ticket.currentStatus} />
                  </div>
                  <p className="tk-queue__summary mb-1">{ticket.summary}</p>
                  <p className="tk-queue__summary text-muted small mb-2">{ticket.requester.name}</p>
                  <div className="d-flex flex-wrap gap-2 small text-muted align-items-center">
                    <PriorityBadge priority={ticket.itPriority} />
                    <Owner ticket={ticket} />
                    <span>
                      Updated <DateTime iso={ticket.updatedAt} />
                    </span>
                    {ticket.requesterResolvedAt && <AppearsResolvedBadge />}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <PaginationControls
            meta={queue.response.meta}
            onPageChange={(page) => show({ page })}
            pageSize={view.pageSize}
            onPageSizeChange={(pageSize) => show({ pageSize })}
          />
        </>
      )}
    </div>
  )
}

export default StaffTicketQueue
