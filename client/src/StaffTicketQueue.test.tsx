import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import * as api from './api'
import type { QueueResponse, QueueTicket } from './api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedInAs } from './test/session'

const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
]

const ELIGIBLE_OWNERS: api.EligibleOwner[] = [
  { id: 20, name: 'Apinya Thongchai', role: 'ADMINISTRATOR' },
  { id: 12, name: 'Wichai Phromma', role: 'IT_STAFF' },
]

function ticket(overrides: Partial<QueueTicket> = {}): QueueTicket {
  return {
    id: 42,
    ticketNumber: 'TKT-2026-000123',
    summary: 'Laptop battery drains quickly',
    requester: { id: 7, name: 'Somchai Jaidee' },
    category: { id: 2, name: 'Hardware' },
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'IN_PROGRESS',
    owner: { id: 12, name: 'Wichai Phromma' },
    requesterResolvedAt: null,
    createdAt: '2026-10-01T02:15:00.000Z',
    updatedAt: '2026-10-02T03:15:00.000Z',
    ...overrides,
  }
}

function queueResponse(data: QueueTicket[], meta: Partial<QueueResponse['meta']> = {}): QueueResponse {
  return {
    data,
    meta: { page: 1, pageSize: 10, totalItems: data.length, totalPages: data.length > 0 ? 1 : 0, ...meta },
  }
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchEligibleOwners').mockResolvedValue(ELIGIBLE_OWNERS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Opens the queue as a signed-in IT Staff user, at /staff/queue or at a
// URL that already carries a view.
async function openQueue(path = '/staff/queue') {
  signedInAs(IT_STAFF)
  openPath(path)
  render(<App />)
  await screen.findByRole('heading', { name: 'Ticket Queue' })
}

// The desktop table. The mobile cards are in the document beside it and
// hidden by CSS, which jsdom does not apply.
async function table() {
  return within(await screen.findByRole('table'))
}

describe('Ticket Queue rows', () => {
  // UI-15 (AC-24, AC-29)
  it('shows a Ticket with its Requester, Category, badges, and owner', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(queueResponse([ticket()]))

    await openQueue()

    const row = within((await table()).getByRole('row', { name: /TKT-2026-000123/ }))
    expect(row.getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(row.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(row.getAllByText('Hardware').length).toBeGreaterThan(0)
    expect(row.getByText('High')).toBeInTheDocument()
    expect(row.getByText('In Progress')).toBeInTheDocument()
    expect(row.getByText('Wichai Phromma')).toBeInTheDocument()
    expect(row.queryByText('Unassigned')).not.toBeInTheDocument()
    expect(row.queryByText('Requester: appears resolved')).not.toBeInTheDocument()
  })

  it('shows Unassigned for a Ticket with no owner, and the flag when the Requester says it appears resolved', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(
      queueResponse([
        ticket({
          id: 43,
          ticketNumber: 'TKT-2026-000124',
          currentStatus: 'WAITING_FOR_REQUESTER',
          itPriority: 'LOW',
          owner: null,
          requesterResolvedAt: '2026-10-02T04:00:00.000Z',
        }),
      ]),
    )

    await openQueue()

    const row = within((await table()).getByRole('row', { name: /TKT-2026-000124/ }))
    expect(row.getByText('Unassigned')).toBeInTheDocument()
    expect(row.getByText('Requester: appears resolved')).toBeInTheDocument()
    expect(row.getByText('Waiting for Requester')).toBeInTheDocument()
    expect(row.getByText('Low')).toBeInTheDocument()
  })

  it.each([
    ['NEW', 'New'],
    ['OPEN', 'Open'],
    ['IN_PROGRESS', 'In Progress'],
    ['WAITING_FOR_REQUESTER', 'Waiting for Requester'],
    ['RESOLVED', 'Resolved'],
    ['REOPENED', 'Reopened'],
    ['CLOSED', 'Closed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('labels the status %s as %s', async (currentStatus, label) => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(queueResponse([ticket({ currentStatus })]))

    await openQueue()

    const row = within((await table()).getByRole('row', { name: /TKT-2026-000123/ }))
    expect(row.getByText(label)).toBeInTheDocument()
  })

  it('opens Ticket Detail from the Ticket Number, which is a link', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(queueResponse([ticket()]))
    await openQueue()

    const link = (await table()).getByRole('link', { name: 'TKT-2026-000123' })
    expect(link).toHaveAttribute('href', '/staff/tickets/42')

    fireEvent.click(link)

    await waitFor(() => expect(window.location.pathname).toBe('/staff/tickets/42'))
  })

  it('opens Ticket Detail from anywhere on the row', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(queueResponse([ticket()]))
    await openQueue()

    fireEvent.click((await table()).getByText('Laptop battery drains quickly'))

    await waitFor(() => expect(window.location.pathname).toBe('/staff/tickets/42'))
  })

  it('opens Ticket Detail from a mobile card', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(queueResponse([ticket()]))
    await openQueue()

    const card = within(await screen.findByRole('listitem'))
    expect(card.getByRole('link', { name: 'TKT-2026-000123' })).toHaveAttribute('href', '/staff/tickets/42')
    expect(card.getByText('In Progress')).toBeInTheDocument()
    expect(card.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(card.getByText('Wichai Phromma')).toBeInTheDocument()

    fireEvent.click(card.getByText('Laptop battery drains quickly'))

    await waitFor(() => expect(window.location.pathname).toBe('/staff/tickets/42'))
  })
})

// What the API is asked for while every control is at its default
// (ui-spec.md §8.2): the unfinished statuses, most recently updated first.
const DEFAULT_REQUEST = {
  page: 1,
  pageSize: 10,
  status: ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'REOPENED'],
  sortBy: 'updatedAt',
  sortDir: 'desc',
}

// The filters with a default the API is not told about.
const NO_FILTERS = {
  search: undefined,
  owner: undefined,
  itPriority: undefined,
  categoryId: undefined,
  appearsResolved: undefined,
}

function mockQueue(response = queueResponse([ticket()])) {
  return vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue(response)
}

// The parameters of the most recent request, exactly.
function lastRequest(fetchQueue: ReturnType<typeof mockQueue>) {
  return fetchQueue.mock.lastCall?.[0]
}

const select = (label: string) => screen.getByRole('combobox', { name: label }) as HTMLSelectElement
const choose = (label: string, option: string) =>
  fireEvent.change(select(label), {
    target: { value: (within(select(label)).getByRole('option', { name: option }) as HTMLOptionElement).value },
  })
const selected = (label: string) => select(label).selectedOptions[0].textContent

describe('Ticket Queue controls', () => {
  // UI-16 (AC-24): the default view
  it('asks for the unfinished Tickets, most recently updated first, ten to a page', async () => {
    const fetchQueue = mockQueue()

    await openQueue()
    await table()

    expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS })
    expect(selected('Status')).toBe('Unfinished')
    expect(selected('Owner')).toBe('Any owner')
    expect(selected('IT Priority')).toBe('Any')
    expect(selected('Category')).toBe('Any')
    expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).not.toBeChecked()
    expect(selected('Sort by')).toBe('Last Updated')
    expect(screen.getByRole('button', { name: 'Descending' })).toBeInTheDocument()
  })

  it('offers every status, the eligible owners by name, and the active Categories', async () => {
    mockQueue()
    await openQueue()
    await table()
    await waitFor(() => expect(within(select('Owner')).getAllByRole('option')).toHaveLength(5))

    const options = (label: string) =>
      within(select(label))
        .getAllByRole('option')
        .map((option) => option.textContent)

    expect(options('Status')).toEqual([
      'Unfinished',
      'All statuses',
      'New',
      'Open',
      'In Progress',
      'Waiting for Requester',
      'Resolved',
      'Closed',
      'Reopened',
      'Cancelled',
    ])
    expect(options('Owner')).toEqual(['Any owner', 'Unassigned', 'Assigned to me', 'Apinya Thongchai', 'Wichai Phromma'])
    expect(options('IT Priority')).toEqual(['Any', 'Low', 'Medium', 'High'])
    expect(options('Category')).toEqual(['Any', 'Account and Access', 'Hardware'])
    expect(options('Sort by')).toEqual(['Last Updated', 'Created Date', 'Ticket No.', 'IT Priority'])
  })

  // UI-16 (AC-25)
  describe('search', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const searchBox = () => screen.getByPlaceholderText('Search by ticket number, summary, or requester…')

    it('is applied 300ms after typing stops', async () => {
      const fetchQueue = mockQueue()
      await openQueue('/staff/queue?page=3')
      await table()
      vi.useFakeTimers()

      fireEvent.change(searchBox(), { target: { value: 'bat' } })
      await act(async () => vi.advanceTimersByTime(200))
      fireEvent.change(searchBox(), { target: { value: 'battery' } })
      await act(async () => vi.advanceTimersByTime(299))

      expect(fetchQueue).toHaveBeenCalledTimes(1)

      await act(async () => vi.advanceTimersByTime(1))

      expect(fetchQueue).toHaveBeenCalledTimes(2)
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, search: 'battery' })
    })

    it('is applied at once on Enter', async () => {
      const fetchQueue = mockQueue()
      await openQueue('/staff/queue?page=3')
      await table()
      vi.useFakeTimers()

      fireEvent.change(searchBox(), { target: { value: '  Somchai ' } })
      fireEvent.keyDown(searchBox(), { key: 'Enter' })
      await act(async () => {})

      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, search: 'Somchai' })

      // The pending timer does not ask again.
      await act(async () => vi.advanceTimersByTime(1000))
      expect(fetchQueue).toHaveBeenCalledTimes(2)
    })

    it('keeps a filter chosen before the typed search is applied', async () => {
      const fetchQueue = mockQueue()
      await openQueue()
      await table()
      vi.useFakeTimers()

      fireEvent.change(searchBox(), { target: { value: 'bat' } })
      await act(async () => vi.advanceTimersByTime(100))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Requester says resolved' }))
      await act(async () => vi.advanceTimersByTime(200))

      expect(lastRequest(fetchQueue)).toEqual({
        ...DEFAULT_REQUEST,
        ...NO_FILTERS,
        search: 'bat',
        appearsResolved: true,
      })
      expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
        search: 'bat',
        appearsResolved: 'true',
      })
      expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).toBeChecked()
    })

    it('is not applied after Clear Filters when it was typed just before', async () => {
      const fetchQueue = mockQueue()
      await openQueue('/staff/queue?status=CLOSED')
      await table()
      vi.useFakeTimers()

      fireEvent.change(searchBox(), { target: { value: 'bat' } })
      await act(async () => vi.advanceTimersByTime(100))
      fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
      await act(async () => vi.advanceTimersByTime(1000))

      expect(fetchQueue).toHaveBeenCalledTimes(2)
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS })
      expect(window.location.search).toBe('')
      expect(searchBox()).toHaveValue('')
      expect(selected('Status')).toBe('Unfinished')
    })
  })

  // UI-16 (AC-26): each filter, from page 3, so that the page returns to 1
  it.each([
    { control: 'Status', option: 'All statuses', request: { status: undefined } },
    { control: 'Status', option: 'Closed', request: { status: ['CLOSED'] } },
    { control: 'Status', option: 'Waiting for Requester', request: { status: ['WAITING_FOR_REQUESTER'] } },
    { control: 'Owner', option: 'Unassigned', request: { owner: 'unassigned' } },
    { control: 'Owner', option: 'Assigned to me', request: { owner: 'me' } },
    { control: 'Owner', option: 'Wichai Phromma', request: { owner: 12 } },
    { control: 'IT Priority', option: 'High', request: { itPriority: 'HIGH' } },
    { control: 'Category', option: 'Hardware', request: { categoryId: 2 } },
  ])('$control "$option" asks for the matching Tickets from page 1', async ({ control, option, request }) => {
    const fetchQueue = mockQueue()
    await openQueue('/staff/queue?page=3')
    await table()
    await waitFor(() => expect(within(select('Owner')).getAllByRole('option')).toHaveLength(5))
    expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, page: 3 })

    choose(control, option)

    await waitFor(() => expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, ...request }))
    expect(selected(control)).toBe(option)
  })

  it('"Requester says resolved" asks for the flagged Tickets from page 1', async () => {
    const fetchQueue = mockQueue()
    await openQueue('/staff/queue?page=3')
    await table()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Requester says resolved' }))

    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, appearsResolved: true }),
    )
    expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).toBeChecked()
  })

  it('combines the filters that are set', async () => {
    const fetchQueue = mockQueue()
    await openQueue()
    await table()

    choose('Status', 'Open')
    choose('IT Priority', 'Low')
    choose('Owner', 'Unassigned')

    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({
        ...DEFAULT_REQUEST,
        ...NO_FILTERS,
        status: ['OPEN'],
        itPriority: 'LOW',
        owner: 'unassigned',
      }),
    )
  })

  // UI-16 (AC-27)
  it('sorts by the chosen field and direction, from page 1', async () => {
    const fetchQueue = mockQueue()
    await openQueue('/staff/queue?page=3')
    await table()

    choose('Sort by', 'Created Date')
    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, sortBy: 'createdAt' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Descending' }))
    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, sortBy: 'createdAt', sortDir: 'asc' }),
    )
    expect(screen.getByRole('button', { name: 'Ascending' })).toBeInTheDocument()
  })

  it('sorts from the sortable column headers, which announce the direction', async () => {
    const fetchQueue = mockQueue()
    await openQueue('/staff/queue?page=3')
    const header = (name: string) => table().then((t) => t.getByRole('columnheader', { name: new RegExp(name) }))

    expect(await header('Last Updated')).toHaveAttribute('aria-sort', 'descending')
    expect(await header('Ticket No')).toHaveAttribute('aria-sort', 'none')
    expect(await header('Summary')).not.toHaveAttribute('aria-sort')

    fireEvent.click(within(await header('IT Priority')).getByRole('button'))
    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, sortBy: 'itPriority' }),
    )
    expect(await header('IT Priority')).toHaveAttribute('aria-sort', 'descending')
    expect(selected('Sort by')).toBe('IT Priority')

    // The header of the current sort turns the direction round.
    fireEvent.click(within(await header('IT Priority')).getByRole('button'))
    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, sortBy: 'itPriority', sortDir: 'asc' }),
    )
    expect(await header('IT Priority')).toHaveAttribute('aria-sort', 'ascending')
    expect(await header('Last Updated')).toHaveAttribute('aria-sort', 'none')
  })

  // UI-16: Clear Filters
  it('Clear Filters returns every control to its default', async () => {
    const fetchQueue = mockQueue()
    await openQueue(
      '/staff/queue?search=battery&status=CLOSED&owner=12&itPriority=HIGH&categoryId=2&appearsResolved=true&sortBy=ticketNumber&sortDir=asc&page=2&pageSize=25',
    )
    await table()
    await waitFor(() => expect(selected('Owner')).toBe('Wichai Phromma'))

    expect(lastRequest(fetchQueue)).toEqual({
      page: 2,
      pageSize: 25,
      search: 'battery',
      status: ['CLOSED'],
      owner: 12,
      itPriority: 'HIGH',
      categoryId: 2,
      appearsResolved: true,
      sortBy: 'ticketNumber',
      sortDir: 'asc',
    })
    expect(screen.getByPlaceholderText(/^Search by/)).toHaveValue('battery')
    expect(selected('Status')).toBe('Closed')
    expect(selected('IT Priority')).toBe('High')
    expect(selected('Category')).toBe('Hardware')
    expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).toBeChecked()
    expect(selected('Sort by')).toBe('Ticket No.')
    expect(screen.getByRole('button', { name: 'Ascending' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))

    await waitFor(() => expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS }))
    expect(screen.getByPlaceholderText(/^Search by/)).toHaveValue('')
    expect(selected('Status')).toBe('Unfinished')
    expect(selected('Owner')).toBe('Any owner')
    expect(selected('IT Priority')).toBe('Any')
    expect(selected('Category')).toBe('Any')
    expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).not.toBeChecked()
    expect(selected('Sort by')).toBe('Last Updated')
    expect(screen.getByRole('button', { name: 'Descending' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  // ui-spec.md §8.2: the view is kept in the URL query
  it('keeps the search, filters, and sort in the URL', async () => {
    mockQueue()
    await openQueue()
    await table()

    choose('Status', 'All statuses')
    choose('Owner', 'Assigned to me')
    choose('Sort by', 'IT Priority')

    await waitFor(() =>
      expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
        status: 'all',
        owner: 'me',
        sortBy: 'itPriority',
      }),
    )
  })

  it('treats a value in the URL that is not one of the choices as the default', async () => {
    const fetchQueue = mockQueue()

    await openQueue(
      '/staff/queue?status=DONE&owner=abc&itPriority=URGENT&categoryId=x&appearsResolved=yes&sortBy=summary&sortDir=up&page=0&pageSize=7',
    )
    await table()

    expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS })
  })
})

describe('Ticket Queue pagination', () => {
  const pagination = () => within(screen.getByRole('navigation', { name: 'Ticket list pagination' }))

  // UI-17 (AC-28)
  it('shows the range of Tickets on the page', async () => {
    mockQueue(queueResponse([ticket()], { page: 2, pageSize: 10, totalItems: 37, totalPages: 4 }))

    await openQueue('/staff/queue?page=2')
    await table()

    expect(pagination().getByText('Showing 11 to 20 of 37 tickets')).toBeInTheDocument()
    expect(pagination().getByText('Page 2 of 4')).toBeInTheDocument()
  })

  it('shows a last page that is not full', async () => {
    mockQueue(queueResponse([ticket()], { page: 4, pageSize: 10, totalItems: 37, totalPages: 4 }))

    await openQueue('/staff/queue?page=4')
    await table()

    expect(pagination().getByText('Showing 31 to 37 of 37 tickets')).toBeInTheDocument()
    expect(pagination().getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(pagination().getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('asks for the next and the previous page, keeping the filters, and keeps the page in the URL', async () => {
    const fetchQueue = mockQueue(queueResponse([ticket()], { page: 2, pageSize: 10, totalItems: 37, totalPages: 4 }))
    await openQueue('/staff/queue?itPriority=HIGH&page=2')
    await table()

    fireEvent.click(pagination().getByRole('button', { name: 'Next' }))

    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, itPriority: 'HIGH', page: 3 }),
    )
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({ itPriority: 'HIGH', page: '3' })

    await table()
    fireEvent.click(pagination().getByRole('button', { name: 'Previous' }))

    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, itPriority: 'HIGH', page: 1 }),
    )
  })

  it('does not go before the first page', async () => {
    mockQueue(queueResponse([ticket()], { page: 1, pageSize: 10, totalItems: 37, totalPages: 4 }))

    await openQueue()
    await table()

    expect(pagination().getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(pagination().getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it.each([25, 50])('asks for %i to a page from page 1 when the page size is changed', async (pageSize) => {
    const fetchQueue = mockQueue(queueResponse([ticket()], { page: 3, pageSize: 10, totalItems: 37, totalPages: 4 }))
    await openQueue('/staff/queue?page=3')
    await table()

    fireEvent.change(pagination().getByRole('combobox', { name: 'Tickets per page' }), {
      target: { value: String(pageSize) },
    })

    await waitFor(() => expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, pageSize }))
  })
})

describe('Ticket Queue states', () => {
  const EMPTY = 'There are no unfinished tickets in the queue.'
  const NO_RESULTS = 'No tickets match your search or filters.'
  const FAILURE = 'Something went wrong. Please try again.'
  const clearFiltersButtons = () => screen.queryAllByRole('button', { name: 'Clear Filters' })

  // UI-18 (AC-29): loading
  it('shows skeleton rows while loading, with the controls usable', async () => {
    let finish: (response: QueueResponse) => void = () => {}
    const fetchQueue = vi
      .spyOn(api, 'fetchStaffQueue')
      .mockReturnValue(new Promise<QueueResponse>((resolve) => (finish = resolve)))

    await openQueue()

    expect(screen.getByRole('status')).toHaveTextContent('Loading tickets…')
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument()
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /TKT-/ })).not.toBeInTheDocument()
    expect(select('Status')).toBeEnabled()
    expect(screen.getByPlaceholderText(/^Search by/)).toBeEnabled()

    // A control used while loading asks again.
    choose('IT Priority', 'High')
    await waitFor(() =>
      expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, itPriority: 'HIGH' }),
    )

    await act(async () => finish(queueResponse([ticket()])))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the answer to the latest request, whatever order the answers arrive in', async () => {
    const answers: Array<(response: QueueResponse) => void> = []
    vi.spyOn(api, 'fetchStaffQueue').mockImplementation(
      () => new Promise<QueueResponse>((resolve) => answers.push(resolve)),
    )
    await openQueue()
    choose('IT Priority', 'High')
    await waitFor(() => expect(answers).toHaveLength(2))

    await act(async () => answers[1](queueResponse([ticket({ ticketNumber: 'TKT-2026-000002' })])))
    await act(async () => answers[0](queueResponse([ticket({ ticketNumber: 'TKT-2026-000001' })])))

    expect((await table()).getByRole('link', { name: 'TKT-2026-000002' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'TKT-2026-000001' })).not.toBeInTheDocument()
  })

  // UI-18 (AC-29): empty
  it('says the queue is empty when nothing is returned with every control at its default', async () => {
    mockQueue(queueResponse([]))

    await openQueue()

    expect(await screen.findByText(EMPTY)).toBeInTheDocument()
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
    expect(clearFiltersButtons()).toHaveLength(1)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Ticket list pagination' })).not.toBeInTheDocument()
  })

  // UI-18 (AC-29): no results
  it.each([
    '/staff/queue?search=nothing',
    '/staff/queue?status=all',
    '/staff/queue?owner=me',
    '/staff/queue?itPriority=LOW',
    '/staff/queue?categoryId=2',
    '/staff/queue?appearsResolved=true',
    '/staff/queue?sortBy=createdAt',
    '/staff/queue?sortDir=asc',
  ])('says nothing matches, with Clear Filters, when nothing is returned at %s', async (path) => {
    const fetchQueue = mockQueue(queueResponse([]))

    await openQueue(path)

    const message = await screen.findByText(NO_RESULTS)
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument()
    expect(clearFiltersButtons()).toHaveLength(2)

    // The one beside the message returns to the default view.
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: 'Clear Filters' }))

    await waitFor(() => expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS }))
    expect(await screen.findByText(EMPTY)).toBeInTheDocument()
  })

  // UI-18 (AC-29): failure
  it.each([
    ['a 500', new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR')],
    ['a lost connection', new Error('Unable to connect to TokTickIT API')],
    ['a refusal with server text', new api.ApiError(400, 'pageSize must be 10, 25, or 50', 'VALIDATION_ERROR', 'pageSize')],
  ])('shows the safe failure with Retry for %s, and the controls keep their values', async (_what, failure) => {
    const fetchQueue = vi.spyOn(api, 'fetchStaffQueue').mockRejectedValue(failure)

    await openQueue('/staff/queue?search=battery&status=CLOSED&itPriority=HIGH')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(FAILURE)
    expect(alert).not.toHaveTextContent(/pageSize|500|connect/)
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument()
    expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/^Search by/)).toHaveValue('battery')
    expect(selected('Status')).toBe('Closed')
    expect(selected('IT Priority')).toBe('High')

    fetchQueue.mockResolvedValue(queueResponse([ticket()]))
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect((await table()).getByRole('link', { name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lastRequest(fetchQueue)).toEqual({
      ...DEFAULT_REQUEST,
      ...NO_FILTERS,
      search: 'battery',
      status: ['CLOSED'],
      itPriority: 'HIGH',
    })
    expect(fetchQueue).toHaveBeenCalledTimes(2)
  })

  it('shows the failure again when Retry fails too', async () => {
    const fetchQueue = vi.spyOn(api, 'fetchStaffQueue').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    await openQueue()

    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(fetchQueue).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILURE)
  })

  // ui-spec.md §2.3: a 403 FORBIDDEN shows the Forbidden page
  it('shows the Forbidden page when the API refuses the role', async () => {
    vi.spyOn(api, 'fetchStaffQueue').mockRejectedValue(
      new api.ApiError(403, 'You do not have permission to do this.', 'FORBIDDEN'),
    )

    await openQueue()

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ticket Queue' })).not.toBeInTheDocument()
  })

  // ui-spec.md §8.3: the queue lists without the Owner and Category choices
  it('still lists the Tickets when the owners and Categories cannot be loaded', async () => {
    vi.mocked(api.fetchCategories).mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    vi.mocked(api.fetchEligibleOwners).mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    mockQueue()

    await openQueue()

    expect((await table()).getByRole('link', { name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(within(select('Owner')).getAllByRole('option')).toHaveLength(3)
  })
})

describe('Ticket Queue roles', () => {
  // AC-24: staff is IT Staff or Administrator
  it('is shown to an Administrator', async () => {
    const fetchQueue = mockQueue()
    signedInAs(ADMINISTRATOR)
    openPath('/staff/queue')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Ticket Queue' })).toBeInTheDocument()
    expect((await table()).getByRole('link', { name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS })
  })

  // ui-spec.md §8.3: Forbidden
  it('shows a Requester the Forbidden page and asks the API for nothing', async () => {
    const fetchQueue = mockQueue()
    signedInAs(REQUESTER)
    openPath('/staff/queue')

    render(<App />)

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(fetchQueue).not.toHaveBeenCalled()
    expect(api.fetchEligibleOwners).not.toHaveBeenCalled()
  })
})

describe('Ticket Queue on a small screen', () => {
  // ui-spec.md §8.4: the filters sit behind a Filters button that shows
  // the number of active filters
  it('counts the active filters on the Filters button, which opens the filter panel', async () => {
    mockQueue()
    await openQueue('/staff/queue?status=CLOSED&owner=me&search=battery&sortBy=createdAt')
    await table()

    const button = screen.getByRole('button', { name: 'Filters (2)' })
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toHaveClass('is-open')
    expect(within(panel).getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Requester says resolved' })).toBeInTheDocument()
    // Search and Sort stay outside the panel.
    expect(within(panel).queryByPlaceholderText(/^Search by/)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument()

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveClass('is-open')

    choose('IT Priority', 'Low')
    choose('Category', 'Hardware')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Requester says resolved' }))

    expect(await screen.findByRole('button', { name: 'Filters (5)' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows no count while no filter is active', async () => {
    mockQueue()
    await openQueue('/staff/queue?search=battery&sortDir=asc&page=2')
    await table()

    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })
})

describe('Ticket Queue on a page past the last', () => {
  it('goes to the last page instead of saying the queue is empty', async () => {
    const fetchQueue = vi
      .spyOn(api, 'fetchStaffQueue')
      .mockResolvedValueOnce(queueResponse([], { page: 9, totalItems: 12, totalPages: 2 }))
      .mockResolvedValue(queueResponse([ticket()], { page: 2, totalItems: 12, totalPages: 2 }))

    await openQueue('/staff/queue?page=9&itPriority=HIGH')

    expect((await table()).getByRole('link', { name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(lastRequest(fetchQueue)).toEqual({ ...DEFAULT_REQUEST, ...NO_FILTERS, itPriority: 'HIGH', page: 2 })
    expect(fetchQueue).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('No tickets match your search or filters.')).not.toBeInTheDocument()
  })
})
