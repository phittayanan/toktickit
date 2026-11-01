import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import * as api from '../api'
import type { RequesterDashboard } from '../api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedInAs } from '../test/session'

const LOADED: RequesterDashboard = {
  openCount: 3,
  waitingForRequesterCount: 1,
  recentlyUpdated: [
    {
      id: 42,
      ticketNumber: 'TKT-2026-000123',
      summary: 'Laptop battery drains quickly',
      currentStatus: 'IN_PROGRESS',
      updatedAt: '2026-10-30T02:10:00.000Z',
    },
  ],
  recentlyResolved: [
    {
      id: 40,
      ticketNumber: 'TKT-2026-000120',
      summary: 'Printer offline on floor 3',
      currentStatus: 'RESOLVED',
      resolvedAt: '2026-10-29T06:00:00.000Z',
    },
  ],
}

const EMPTY: RequesterDashboard = { openCount: 0, waitingForRequesterCount: 0, recentlyUpdated: [], recentlyResolved: [] }

const EMPTY_LIST = { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }

function renderAt(path: string, user = REQUESTER) {
  signedInAs(user)
  openPath(path)
  render(<App />)
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue([])
  vi.spyOn(api, 'fetchTickets').mockResolvedValue(EMPTY_LIST)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Requester Dashboard', () => {
  // UI-14 (AC-27, AC-34)
  it('shows the counts as links to filtered My Tickets', async () => {
    vi.spyOn(api, 'fetchRequesterDashboard').mockResolvedValue(LOADED)

    renderAt('/dashboard')

    expect(await screen.findByRole('link', { name: 'Open Tickets: 3' })).toHaveAttribute(
      'href',
      '/tickets?currentStatus=open',
    )
    expect(screen.getByRole('link', { name: 'Waiting for Requester: 1' })).toHaveAttribute(
      'href',
      '/tickets?currentStatus=WAITING_FOR_REQUESTER',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Not yet resolved')).toBeInTheDocument()
    expect(screen.getByText('Needs your reply')).toBeInTheDocument()
  })

  it('lists recent Tickets, each opening its Ticket Detail', async () => {
    vi.spyOn(api, 'fetchRequesterDashboard').mockResolvedValue(LOADED)

    renderAt('/dashboard')

    const updated = within(await screen.findByRole('region', { name: 'Recently updated' }))
    const row = updated.getByRole('link', { name: /TKT-2026-000123/ })
    expect(row).toHaveAttribute('href', '/tickets/42')
    expect(within(row).getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(within(row).getByText('In Progress')).toBeInTheDocument()
    expect(within(row).getByText(/Last Updated/)).toBeInTheDocument()
    expect(updated.getByText('Last 7 days')).toBeInTheDocument()

    const resolved = within(screen.getByRole('region', { name: 'Recently resolved' }))
    const resolvedRow = resolved.getByRole('link', { name: /TKT-2026-000120/ })
    expect(resolvedRow).toHaveAttribute('href', '/tickets/40')
    expect(within(resolvedRow).getByText(/Resolved on/)).toBeInTheDocument()
  })

  // UI-15 (AC-35, AC-38)
  it('shows skeletons while loading', () => {
    vi.spyOn(api, 'fetchRequesterDashboard').mockReturnValue(new Promise(() => {}))

    renderAt('/dashboard')

    return waitFor(() => expect(screen.getByText('Loading dashboard…')).toBeInTheDocument())
  })

  it('shows 0 and the empty messages when there is nothing', async () => {
    vi.spyOn(api, 'fetchRequesterDashboard').mockResolvedValue(EMPTY)

    renderAt('/dashboard')

    expect(await screen.findByRole('link', { name: 'Open Tickets: 0' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Waiting for Requester: 0' })).toBeInTheDocument()
    expect(screen.getByText('No tickets updated in the last 7 days.')).toBeInTheDocument()
    expect(screen.getByText('No tickets resolved in the last 7 days.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a safe failure in place of the content, and Retry loads it', async () => {
    const fetch = vi
      .spyOn(api, 'fetchRequesterDashboard')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:4000'))
      .mockResolvedValue(LOADED)

    renderAt('/dashboard')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('ECONNREFUSED')
    expect(screen.queryByRole('region', { name: 'Recently updated' })).not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: 'Open Tickets: 3' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows the Forbidden page when the API refuses the role', async () => {
    vi.spyOn(api, 'fetchRequesterDashboard').mockRejectedValue(new api.ApiError(403, 'No.', 'FORBIDDEN'))

    renderAt('/dashboard')

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it.each([IT_STAFF, ADMINISTRATOR])('shows the Forbidden page to $role and requests nothing', async (user) => {
    const fetch = vi.spyOn(api, 'fetchRequesterDashboard')

    renderAt('/dashboard', user)

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})

// UI-19 (AC-34)
describe('My Tickets opened with a URL filter', () => {
  const OPEN_LIST = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED'

  it('applies Open Tickets as the five statuses, and the select shows it', async () => {
    renderAt('/tickets?currentStatus=open')

    await waitFor(() =>
      expect(api.fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: OPEN_LIST })),
    )
    expect(screen.getByLabelText('Current Status')).toHaveValue('open')
    expect(screen.getByRole('option', { name: 'Open Tickets' })).toBeInTheDocument()
  })

  it('applies Waiting for Requester', async () => {
    renderAt('/tickets?currentStatus=WAITING_FOR_REQUESTER')

    await waitFor(() =>
      expect(api.fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: 'WAITING_FOR_REQUESTER' })),
    )
    expect(screen.getByLabelText('Current Status')).toHaveValue('WAITING_FOR_REQUESTER')
  })

  it('ignores a value the select does not list', async () => {
    renderAt('/tickets?currentStatus=CLOSED')

    await waitFor(() => expect(api.fetchTickets).toHaveBeenCalled())
    expect(api.fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: undefined }))
    expect(screen.getByLabelText('Current Status')).toHaveValue('')
  })

  it('sends the five statuses when Open Tickets is chosen in the select', async () => {
    renderAt('/tickets')
    await waitFor(() => expect(api.fetchTickets).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Current Status'), { target: { value: 'open' } })

    await waitFor(() =>
      expect(api.fetchTickets).toHaveBeenLastCalledWith(expect.objectContaining({ currentStatus: OPEN_LIST })),
    )
  })

  it('leaves the filter when My Tickets is chosen in the navigation', async () => {
    renderAt('/tickets?currentStatus=open')
    await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveValue('open'))

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'My Tickets' }))

    await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveValue(''))
  })
})

describe('User Management opened with a URL filter', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchAdminUsers').mockResolvedValue([])
  })

  it('starts with the role filter applied, and the control shows it', async () => {
    renderAt('/admin/users?role=IT_STAFF', ADMINISTRATOR)

    await waitFor(() => expect(api.fetchAdminUsers).toHaveBeenCalledWith({ role: 'IT_STAFF' }))
    expect(screen.getByLabelText(/role/i)).toHaveValue('IT_STAFF')
  })

  it('ignores a value that is not a role', async () => {
    renderAt('/admin/users?role=OWNER', ADMINISTRATOR)

    await waitFor(() => expect(api.fetchAdminUsers).toHaveBeenCalledWith({}))
    expect(screen.getByLabelText(/role/i)).toHaveValue('')
  })
})
