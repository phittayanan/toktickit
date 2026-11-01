import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import * as api from '../api'
import type { StaffDashboard } from '../api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedInAs } from '../test/session'

const TICKET = {
  id: 42,
  ticketNumber: 'TKT-2026-000123',
  summary: 'Laptop battery drains quickly',
  currentStatus: 'IN_PROGRESS' as const,
  itPriority: 'HIGH' as const,
  owner: { id: 12, name: 'Wichai Phromma' },
  updatedAt: '2026-10-30T02:10:00.000Z',
}

const LOADED: StaffDashboard = {
  unassignedCount: 4,
  ownedByMeCount: 6,
  myPlannedActionsTakenCount: 7,
  byStatus: { NEW: 2, OPEN: 3, IN_PROGRESS: 5, WAITING_FOR_REQUESTER: 1, RESOLVED: 2, REOPENED: 0 },
  byItPriority: { LOW: 4, MEDIUM: 6, HIGH: 3 },
  myPlannedActionsTaken: [
    {
      id: 91,
      ticketId: 42,
      ticketNumber: 'TKT-2026-000123',
      description: 'Replace the docking station.',
      actionAt: '2026-10-31T02:00:00.000Z',
    },
  ],
  urgent: [TICKET],
  recentlyUpdated: [{ ...TICKET, id: 43, ticketNumber: 'TKT-2026-000124', owner: null }],
}

const EMPTY: StaffDashboard = {
  unassignedCount: 0,
  ownedByMeCount: 0,
  myPlannedActionsTakenCount: 0,
  byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, REOPENED: 0 },
  byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  myPlannedActionsTaken: [],
  urgent: [],
  recentlyUpdated: [],
}

const ACCOUNTS = { activeUsers: { REQUESTER: 8, IT_STAFF: 3, ADMINISTRATOR: 1 } }

function renderAt(path: string, user = IT_STAFF) {
  signedInAs(user)
  openPath(path)
  render(<App />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IT Staff Dashboard', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchAdminDashboard').mockResolvedValue(ACCOUNTS)
  })

  // UI-16 (AC-30, AC-31, AC-32, AC-34)
  it('links each metric card to its Ticket Queue view', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(LOADED)

    renderAt('/staff/dashboard')

    expect(await screen.findByRole('link', { name: 'Unassigned: 4' })).toHaveAttribute(
      'href',
      '/staff/queue?owner=unassigned',
    )
    expect(screen.getByRole('link', { name: 'Owned by me: 6' })).toHaveAttribute('href', '/staff/queue?owner=me')
  })

  it('moves focus to the list from the My Planned Actions Taken card', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(LOADED)

    renderAt('/staff/dashboard')

    fireEvent.click(await screen.findByRole('link', { name: 'My Planned Actions Taken: 7' }))

    const list = screen.getByRole('region', { name: 'My Planned Actions Taken' })
    expect(list).toHaveFocus()
    expect(window.location.pathname).toBe('/staff/dashboard')
    // The card's link target exists, for a link opened in a new tab too.
    expect(screen.getByRole('link', { name: 'My Planned Actions Taken: 7' })).toHaveAttribute(
      'href',
      `/staff/dashboard#${list.id}`,
    )
  })

  it('links every status and IT Priority row, zeros included', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(LOADED)

    renderAt('/staff/dashboard')

    const byStatus = within(await screen.findByRole('region', { name: 'By status' }))
    const statusRows = [
      ['New: 2', 'NEW'],
      ['Open: 3', 'OPEN'],
      ['In Progress: 5', 'IN_PROGRESS'],
      ['Waiting for Requester: 1', 'WAITING_FOR_REQUESTER'],
      ['Resolved: 2', 'RESOLVED'],
      ['Reopened: 0', 'REOPENED'],
    ]
    expect(byStatus.getAllByRole('link')).toHaveLength(6)
    for (const [name, status] of statusRows) {
      expect(byStatus.getByRole('link', { name })).toHaveAttribute('href', `/staff/queue?status=${status}`)
    }

    const byPriority = within(screen.getByRole('region', { name: 'By IT Priority' }))
    expect(byPriority.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'High: 3',
      'Medium: 6',
      'Low: 4',
    ])
    expect(byPriority.getByRole('link', { name: 'High: 3' })).toHaveAttribute('href', '/staff/queue?itPriority=HIGH')
  })

  it('lists planned actions, urgent, and recent Tickets with their links and fields', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(LOADED)

    renderAt('/staff/dashboard')

    const planned = within(await screen.findByRole('region', { name: 'My Planned Actions Taken' }))
    const plannedRow = planned.getByRole('link', { name: /TKT-2026-000123/ })
    expect(plannedRow).toHaveAttribute('href', '/staff/tickets/42#actions-taken')
    expect(within(plannedRow).getByText('Replace the docking station.')).toBeInTheDocument()

    const urgentRow = within(screen.getByRole('region', { name: 'Urgent' })).getByRole('link', {
      name: /TKT-2026-000123/,
    })
    expect(urgentRow).toHaveAttribute('href', '/staff/tickets/42')
    expect(within(urgentRow).getByText('In Progress')).toBeInTheDocument()
    expect(within(urgentRow).getByText('High')).toBeInTheDocument()
    expect(within(urgentRow).getByText('Wichai Phromma')).toBeInTheDocument()

    const recent = within(screen.getByRole('region', { name: 'Recently updated' }))
    const recentRow = recent.getByRole('link', { name: /TKT-2026-000124/ })
    expect(recentRow).toHaveAttribute('href', '/staff/tickets/43')
    expect(within(recentRow).getByText('Unassigned')).toBeInTheDocument()
    expect(within(recentRow).getByText(/Last Updated/)).toBeInTheDocument()
    expect(recent.getByText('Last 7 days')).toBeInTheDocument()
  })

  // UI-17 (AC-35, AC-38)
  it('shows skeletons while loading', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockReturnValue(new Promise(() => {}))

    renderAt('/staff/dashboard')

    expect(await screen.findByText('Loading dashboard…')).toBeInTheDocument()
  })

  it('shows 0 and the empty messages when there is nothing', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(EMPTY)

    renderAt('/staff/dashboard')

    expect(await screen.findByRole('link', { name: 'Unassigned: 0' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New: 0' })).toBeInTheDocument()
    expect(screen.getByText('No planned actions assigned to you.')).toBeInTheDocument()
    expect(screen.getByText('No urgent tickets.')).toBeInTheDocument()
    expect(screen.getByText('No tickets updated in the last 7 days.')).toBeInTheDocument()
  })

  it('shows the Forbidden page to a Requester and requests nothing', async () => {
    const fetch = vi.spyOn(api, 'fetchStaffDashboard')

    renderAt('/staff/dashboard', REQUESTER)

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the Forbidden page when the API refuses the role', async () => {
    vi.spyOn(api, 'fetchStaffDashboard').mockRejectedValue(new api.ApiError(403, 'No.', 'FORBIDDEN'))

    renderAt('/staff/dashboard')

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it('shows a safe failure in place of the content, and Retry loads it', async () => {
    vi.spyOn(api, 'fetchStaffDashboard')
      .mockRejectedValueOnce(new api.ApiError(500, 'stack trace at line 3', 'INTERNAL_ERROR'))
      .mockResolvedValue(LOADED)

    renderAt('/staff/dashboard')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('stack trace')
    expect(screen.queryByRole('region', { name: 'Urgent' })).not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: 'Unassigned: 4' })).toBeInTheDocument()
  })
})

// UI-18 (AC-33)
describe('Active accounts', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(LOADED)
  })

  it('shows an Administrator the counts, linking to filtered User Management', async () => {
    vi.spyOn(api, 'fetchAdminDashboard').mockResolvedValue(ACCOUNTS)

    renderAt('/staff/dashboard', ADMINISTRATOR)

    const section = within(await screen.findByRole('region', { name: 'Active accounts' }))
    expect(await section.findByRole('link', { name: 'Requesters: 8' })).toHaveAttribute(
      'href',
      '/admin/users?role=REQUESTER',
    )
    expect(section.getByRole('link', { name: 'IT Staff: 3' })).toHaveAttribute('href', '/admin/users?role=IT_STAFF')
    expect(section.getByRole('link', { name: 'Administrators: 1' })).toHaveAttribute(
      'href',
      '/admin/users?role=ADMINISTRATOR',
    )
    expect(section.getByText('User Management also lists inactive accounts.')).toBeInTheDocument()
  })

  it('never shows IT Staff the section or makes the request', async () => {
    const fetch = vi.spyOn(api, 'fetchAdminDashboard')

    renderAt('/staff/dashboard')

    await screen.findByRole('link', { name: 'Unassigned: 4' })
    expect(screen.queryByRole('region', { name: 'Active accounts' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('leaves the rest usable when its request fails, and Retry loads only it', async () => {
    const accounts = vi
      .spyOn(api, 'fetchAdminDashboard')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(ACCOUNTS)

    renderAt('/staff/dashboard', ADMINISTRATOR)

    const section = within(await screen.findByRole('region', { name: 'Active accounts' }))
    const alert = await section.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(await screen.findByRole('link', { name: 'Unassigned: 4' })).toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await section.findByRole('link', { name: 'Requesters: 8' })).toBeInTheDocument()
    expect(api.fetchStaffDashboard).toHaveBeenCalledTimes(1)
    expect(accounts).toHaveBeenCalledTimes(2)
  })
})

// UI-20 (AC-43)
describe('Dashboard in the shell', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchStaffDashboard').mockResolvedValue(EMPTY)
    vi.spyOn(api, 'fetchAdminDashboard').mockResolvedValue(ACCOUNTS)
    vi.spyOn(api, 'fetchRequesterDashboard').mockResolvedValue({
      openCount: 0,
      waitingForRequesterCount: 0,
      recentlyUpdated: [],
      recentlyResolved: [],
    })
  })

  it.each([
    { user: REQUESTER, landing: '/dashboard', entries: ['Dashboard', 'My Tickets', 'Create Ticket'] },
    { user: IT_STAFF, landing: '/staff/dashboard', entries: ['Dashboard', 'Ticket Queue'] },
    { user: ADMINISTRATOR, landing: '/staff/dashboard', entries: ['Dashboard', 'Ticket Queue', 'User Management'] },
  ])('lands $user.role on the Dashboard, its first entry and active', async ({ user, landing, entries }) => {
    renderAt('/', user)

    await waitFor(() => expect(window.location.pathname).toBe(landing))
    const nav = within(screen.getByRole('navigation', { name: 'Primary' }))
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(nav.getAllByRole('button').map((entry) => entry.textContent)).toEqual(entries)
    expect(nav.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    { user: REQUESTER, path: '/staff/queue', landing: '/dashboard' },
    { user: IT_STAFF, path: '/admin/users', landing: '/staff/dashboard' },
    { user: ADMINISTRATOR, path: '/tickets', landing: '/staff/dashboard' },
  ])('takes $user.role from the Forbidden page to the Dashboard', async ({ user, path, landing }) => {
    renderAt(path, user)

    fireEvent.click(await screen.findByRole('button', { name: 'Go to Dashboard' }))

    await waitFor(() => expect(window.location.pathname).toBe(landing))
  })

  it.each([
    { user: REQUESTER, label: 'My Tickets', path: '/tickets' },
    { user: IT_STAFF, label: 'Ticket Queue', path: '/staff/queue' },
    { user: ADMINISTRATOR, label: 'User Management', path: '/admin/users' },
  ])('keeps the Lab 3 list link on the Not Found page of $user.role', async ({ user, label, path }) => {
    renderAt('/no-such-page', user)

    expect(await screen.findByRole('link', { name: `Back to ${label}` })).toHaveAttribute('href', path)
  })
})
