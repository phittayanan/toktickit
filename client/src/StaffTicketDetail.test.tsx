import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import * as api from './api'
import type { Entry, StaffTicket } from './api'
import { ADMINISTRATOR, IT_STAFF, openPath, signedInAs } from './test/session'

const ELIGIBLE_OWNERS: api.EligibleOwner[] = [
  { id: 20, name: 'Apinya Thongchai', role: 'ADMINISTRATOR' },
  { id: 31, name: 'Siriporn Kaewmanee', role: 'IT_STAFF' },
  { id: 12, name: 'Wichai Phromma', role: 'IT_STAFF' },
]

// An In Progress Ticket owned by the signed-in IT Staff user.
function ticket(overrides: Partial<StaffTicket> = {}): StaffTicket {
  return {
    id: 42,
    ticketNumber: 'TKT-2026-000123',
    summary: 'Laptop battery drains quickly',
    description: 'The battery goes from full to empty\nin under two hours.',
    requester: { id: 7, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th', isActive: true },
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 5, name: 'Printing' },
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'IN_PROGRESS',
    allowedTransitions: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    owner: { id: 12, name: 'Wichai Phromma' },
    ownerChangedAt: '2026-10-01T04:00:00.000Z',
    resolutionSummary: null,
    resolvedAt: null,
    requesterResolvedAt: null,
    publicCommentCount: 0,
    internalNoteCount: 0,
    attachments: [],
    createdAt: '2026-10-01T02:15:00.000Z',
    updatedAt: '2026-10-02T03:15:00.000Z',
    ...overrides,
  }
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 31,
    body: 'We are checking the battery.',
    createdAt: '2026-10-02T03:15:00.000Z',
    author: { id: 12, name: 'Wichai Phromma', role: 'IT_STAFF' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(api, 'fetchEligibleOwners').mockResolvedValue(ELIGIBLE_OWNERS)
  vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([])
  vi.spyOn(api, 'fetchInternalNotes').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Opens Staff Ticket Detail for Ticket 42 as a signed-in Staff user.
function openDetail(user = IT_STAFF, path = '/staff/tickets/42') {
  signedInAs(user)
  openPath(path)
  render(<App />)
}

// Opens it on `loaded` and waits for the Ticket to show.
async function openLoaded(loaded: StaffTicket = ticket(), user = IT_STAFF) {
  const fetchStaffTicket = vi.spyOn(api, 'fetchStaffTicket').mockResolvedValue(loaded)
  openDetail(user)
  await screen.findByRole('heading', { level: 1, name: loaded.ticketNumber })

  return fetchStaffTicket
}

const information = () => within(screen.getByRole('region', { name: 'Ticket information' }))
const operations = () => within(screen.getByRole('region', { name: 'Manage this ticket' }))

describe('Staff Ticket Detail page states', () => {
  // UI-19 (AC-30): Loading
  it('shows a skeleton while the Ticket loads', async () => {
    vi.spyOn(api, 'fetchStaffTicket').mockReturnValue(new Promise(() => {}))

    openDetail()

    expect((await screen.findByText('Loading ticket…')).closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Manage this ticket' })).not.toBeInTheDocument()
    expect(api.fetchStaffTicket).toHaveBeenCalledWith(42)
  })

  // UI-19 (AC-30): the loaded layout
  it('shows the Ticket information read-only, with only the owner, IT Priority, and status editable', async () => {
    await openLoaded(
      ticket({
        requester: { id: 7, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th', isActive: false },
        requesterResolvedAt: '2026-10-02T04:00:00.000Z',
      }),
    )

    // Header row
    const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(breadcrumb.getByRole('link', { name: 'Ticket Queue' })).toHaveAttribute('href', '/staff/queue')
    expect(breadcrumb.getByText('TKT-2026-000123')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Back to Queue' })).toBeInTheDocument()
    const statusBadges = screen.getByRole('group', { name: 'Ticket status' })
    expect(statusBadges.parentElement).toBe(screen.getByRole('button', { name: 'Back to Queue' }).parentElement)
    const header = within(statusBadges)
    expect(header.getByText('In Progress')).toBeInTheDocument()
    expect(header.getByText('Requester: appears resolved')).toBeInTheDocument()
    expect(header.getByText(/Oct 2, 2026/)).toBeInTheDocument()

    // Ticket information: every field, none of them a control.
    const info = information()
    for (const label of [
      'Ticket Number',
      'Created',
      'Last Updated',
      'Requester',
      'Category',
      'Related System',
      'Requested Priority',
      'Summary',
      'Description',
    ]) {
      expect(info.getByText(label)).toBeInTheDocument()
    }
    expect(info.getByText('TKT-2026-000123')).toBeInTheDocument()
    expect(info.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(info.getByText('somchai.jaidee@kmutt.ac.th')).toBeInTheDocument()
    expect(info.getByText('Inactive')).toBeInTheDocument()
    expect(info.getByText('Hardware')).toBeInTheDocument()
    expect(info.getByText('Printing')).toBeInTheDocument()
    expect(info.getByText('Medium')).toBeInTheDocument()
    expect(info.getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(info.getByText(/The battery goes from full to empty/)).toBeInTheDocument()
    for (const role of ['combobox', 'textbox', 'button']) {
      expect(info.queryAllByRole(role)).toEqual([])
    }

    // Operations: the three editable controls, and nothing else to edit.
    const ops = operations()
    expect(ops.getByRole('heading', { name: 'Manage this ticket' })).toBeInTheDocument()
    expect(ops.getAllByRole('combobox')).toHaveLength(3)
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('12')
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toHaveValue('HIGH')
    expect(ops.getByRole('combobox', { name: 'Current Status' })).toHaveValue('')
    expect(ops.queryAllByRole('textbox')).toEqual([])

    // No Resolution Summary yet, and no Service Actions tab.
    expect(screen.queryByText('Resolution Summary')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Public Comments (0)',
      expect.stringContaining('Internal Notes (0)'),
      'Attachments (0)',
    ])
  })

  it('shows an active requester without the Inactive badge, no flag, and the Resolution Summary when there is one', async () => {
    await openLoaded(
      ticket({
        currentStatus: 'RESOLVED',
        allowedTransitions: ['CLOSED', 'REOPENED'],
        resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
        resolvedAt: '2026-10-03T08:00:00.000Z',
      }),
    )

    expect(information().queryByText('Inactive')).not.toBeInTheDocument()
    expect(screen.queryByText('Requester: appears resolved')).not.toBeInTheDocument()
    const resolution = within(screen.getByRole('region', { name: 'Resolution Summary' }))
    expect(resolution.getByText('Replaced the battery; charge now holds for 7 hours.')).toBeInTheDocument()
    expect(resolution.getByText(/Resolved on Oct 3, 2026/)).toBeInTheDocument()
    expect(resolution.queryAllByRole('textbox')).toEqual([])
  })

  // UI-19 (AC-30): Attachments are download only
  it('lists active Attachments with a Download action, removed ones with their reason, and no Add or Remove', async () => {
    const downloadAttachment = vi.spyOn(api, 'downloadAttachment').mockResolvedValue()
    await openLoaded(
      ticket({
        attachments: [
          {
            id: 5,
            originalFilename: 'screenshot.png',
            mimeType: 'image/png',
            sizeBytes: 204800,
            createdAt: '2026-10-01T02:16:00.000Z',
            removedAt: null,
            removedByRequesterId: null,
            removalReason: null,
          },
          {
            id: 4,
            originalFilename: 'old-screenshot.png',
            mimeType: 'image/png',
            sizeBytes: 190000,
            createdAt: '2026-10-01T02:15:30.000Z',
            removedAt: '2026-10-01T02:20:00.000Z',
            removedByRequesterId: 7,
            removalReason: 'Uploaded the wrong screenshot',
          },
        ],
      }),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Attachments (1)' }))
    const panel = within(screen.getByRole('tabpanel', { name: 'Attachments (1)' }))

    expect(panel.getByText('screenshot.png')).toBeInTheDocument()
    expect(panel.getByText('200.0 KB')).toBeInTheDocument()
    expect(panel.getByText('old-screenshot.png')).toBeInTheDocument()
    expect(panel.getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument()
    expect(panel.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Download screenshot.png',
    ])
    expect(panel.queryByLabelText('Add Attachment')).not.toBeInTheDocument()
    expect(panel.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: 'Download screenshot.png' }))
    expect(downloadAttachment).toHaveBeenCalledWith(5, 'screenshot.png')
  })

  it('says so when the Ticket has no Attachments', async () => {
    await openLoaded()
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments (0)' }))

    expect(within(screen.getByRole('tabpanel', { name: 'Attachments (0)' })).getByText('No attachments.')).toBeInTheDocument()
  })

  // UI-19 (AC-30): Not found
  it.each([
    { user: IT_STAFF, who: 'IT Staff' },
    { user: ADMINISTRATOR, who: 'an Administrator' },
  ])('shows the Not Found page with a link to the queue to $who for an unknown Ticket', async ({ user }) => {
    vi.spyOn(api, 'fetchStaffTicket').mockRejectedValue(new api.ApiError(404, 'Ticket not found', 'NOT_FOUND'))

    openDetail(user)

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Ticket Queue' })).toHaveAttribute('href', '/staff/queue')
    expect(screen.queryByRole('region', { name: 'Manage this ticket' })).not.toBeInTheDocument()
  })

  it('shows the Not Found page for a path that names no Ticket, without asking the API', async () => {
    const fetchStaffTicket = vi.spyOn(api, 'fetchStaffTicket')

    openDetail(IT_STAFF, '/staff/tickets/not-a-number')

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Ticket Queue' })).toHaveAttribute('href', '/staff/queue')
    expect(fetchStaffTicket).not.toHaveBeenCalled()
  })

  // ui-spec.md §9.6: Forbidden, when the API says so
  it('shows the Forbidden page when the API answers 403 FORBIDDEN', async () => {
    vi.spyOn(api, 'fetchStaffTicket').mockRejectedValue(new api.ApiError(403, 'Not permitted.', 'FORBIDDEN'))

    openDetail()

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  // UI-19 (AC-30): Failure
  it('shows the safe failure with Retry when the Ticket cannot be loaded, and loads it on Retry', async () => {
    const fetchStaffTicket = vi
      .spyOn(api, 'fetchStaffTicket')
      .mockRejectedValueOnce(new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR'))
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValue(ticket())

    openDetail()

    for (const attempt of [1, 2]) {
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Something went wrong. Please try again.')
      expect(alert).not.toHaveTextContent(/500|connect/i)
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
      await waitFor(() => expect(fetchStaffTicket).toHaveBeenCalledTimes(attempt + 1))
    }

    expect(await screen.findByRole('heading', { level: 1, name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// A request that stays in flight until the test settles it.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const CONFLICT_TEXT = 'This ticket was changed by someone else. The latest details are shown below.'
const SAFE_FAILURE_TEXT = 'Something went wrong. Please try again.'

describe('Staff Ticket Detail: Ticket Owner', () => {
  const unassigned = () =>
    ticket({ currentStatus: 'NEW', allowedTransitions: ['OPEN', 'CANCELLED'], owner: null, ownerChangedAt: null })

  // UI-20 (AC-31)
  it('Claim assigns an unassigned Ticket to the signed-in user with one request, and says a New Ticket was opened', async () => {
    await openLoaded(unassigned())
    const claimed = ticket({ currentStatus: 'OPEN', allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'] })
    const request = deferred<StaffTicket>()
    const updateTicketOwner = vi.spyOn(api, 'updateTicketOwner').mockReturnValue(request.promise)
    const ops = operations()
    expect(ops.getByText('Current owner:').parentElement).toHaveTextContent('Current owner: Unassigned')
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('')

    fireEvent.click(ops.getByRole('button', { name: 'Claim' }))

    // Saving: the pressed button is busy, that control is disabled, the
    // others stay usable.
    expect(ops.getByRole('button', { name: 'Claim' })).toHaveAttribute('aria-busy', 'true')
    expect(ops.getByRole('button', { name: 'Claim' })).toBeDisabled()
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toBeDisabled()
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toBeEnabled()
    expect(ops.getByRole('combobox', { name: 'Current Status' })).toBeEnabled()

    request.resolve(claimed)

    expect(await ops.findByRole('status')).toHaveTextContent('Owner updated. Status changed to Open.')
    expect(updateTicketOwner).toHaveBeenCalledTimes(1)
    expect(updateTicketOwner).toHaveBeenCalledWith(42, IT_STAFF.id, null)
    // The card shows the returned values.
    expect(ops.getByText('Current owner:').parentElement).toHaveTextContent('Current owner: Wichai Phromma')
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('12')
    expect(ops.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(within(ops.getByRole('combobox', { name: 'Current Status' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a new status…',
      'In Progress',
      'Waiting for Requester',
      'Cancelled',
    ])
    expect(within(screen.getByRole('group', { name: 'Ticket status' })).getByText('Open')).toBeInTheDocument()
  })

  it('offers no Claim on a Ticket that has an owner, and lists Unassigned and every eligible owner', async () => {
    await openLoaded()
    const ops = operations()

    expect(ops.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(within(ops.getByRole('combobox', { name: 'Ticket Owner' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Unassigned',
      'Apinya Thongchai',
      'Siriporn Kaewmanee',
      'Wichai Phromma',
    ])
    // Enabled once the selection differs from the current owner.
    expect(ops.getByRole('button', { name: 'Update Owner' })).toBeDisabled()
    fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value: '31' } })
    expect(ops.getByRole('button', { name: 'Update Owner' })).toBeEnabled()
    fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value: '12' } })
    expect(ops.getByRole('button', { name: 'Update Owner' })).toBeDisabled()
  })

  it('assigns the signed-in user\'s own or an unassigned Ticket without a confirmation', async () => {
    await openLoaded()
    const updateTicketOwner = vi
      .spyOn(api, 'updateTicketOwner')
      .mockResolvedValue(ticket({ owner: { id: 31, name: 'Siriporn Kaewmanee' } }))
    const ops = operations()

    fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value: '31' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Owner' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await ops.findByRole('status')).toHaveTextContent('Owner updated.')
    expect(ops.getByRole('status')).not.toHaveTextContent('Status changed')
    expect(updateTicketOwner).toHaveBeenCalledWith(42, 31, 12)
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('31')
    expect(ops.getByRole('button', { name: 'Update Owner' })).toBeDisabled()
  })

  // UI-20 (AC-32, BR-23)
  it('asks for confirmation before taking a Ticket from another owner, and sends nothing when it is dismissed', async () => {
    await openLoaded(ticket({ owner: { id: 31, name: 'Siriporn Kaewmanee' } }))
    const updateTicketOwner = vi.spyOn(api, 'updateTicketOwner').mockResolvedValue(ticket())
    const ops = operations()
    const choose = (value: string) => {
      fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value } })
      fireEvent.click(ops.getByRole('button', { name: 'Update Owner' }))
      return screen.getByRole('dialog')
    }

    // Dismissed by Cancel, by Escape, and by the backdrop.
    let dialog = choose('12')
    expect(dialog).toHaveTextContent('TKT-2026-000123 is owned by Siriporn Kaewmanee. Reassign it to Wichai Phromma?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    dialog = choose('')
    expect(dialog).toHaveTextContent(
      'TKT-2026-000123 is owned by Siriporn Kaewmanee. Return it to the queue as unassigned?',
    )
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    dialog = choose('20')
    fireEvent.click(dialog.parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketOwner).not.toHaveBeenCalled()
    // The selection is kept.
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('20')

    // Confirmed: one request, stating the owner the client last saw.
    dialog = choose('12')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }))

    expect(await ops.findByRole('status')).toHaveTextContent('Owner updated.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketOwner).toHaveBeenCalledTimes(1)
    expect(updateTicketOwner).toHaveBeenCalledWith(42, 12, 31)
  })

  // UI-20 (AC-32): Conflict
  it('shows the Conflict notice and reloads the Ticket when the owner was changed by someone else', async () => {
    const fetchStaffTicket = await openLoaded(unassigned())
    fetchStaffTicket.mockResolvedValue(
      ticket({ currentStatus: 'OPEN', allowedTransitions: ['IN_PROGRESS'], owner: { id: 31, name: 'Siriporn Kaewmanee' } }),
    )
    vi.spyOn(api, 'updateTicketOwner').mockRejectedValue(
      new api.ApiError(409, 'The ticket owner was changed by someone else.', 'OWNER_CHANGED'),
    )
    const ops = operations()

    fireEvent.click(ops.getByRole('button', { name: 'Claim' }))

    expect(await ops.findByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
    await waitFor(() => expect(fetchStaffTicket).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(ops.getByText('Current owner:').parentElement).toHaveTextContent('Current owner: Siriporn Kaewmanee'),
    )
    expect(ops.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(ops.getByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
  })

  it('shows the safe failure in the Operations card and keeps the selection when the request fails', async () => {
    await openLoaded()
    vi.spyOn(api, 'updateTicketOwner').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    const ops = operations()

    fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value: '31' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Owner' }))

    expect(await ops.findByRole('alert')).toHaveTextContent(SAFE_FAILURE_TEXT)
    expect(ops.getByRole('alert')).not.toHaveTextContent(/connect/i)
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toHaveValue('31')
    expect(ops.getByRole('button', { name: 'Update Owner' })).toBeEnabled()
  })

  it('shows the API\'s own message when it refuses the owner chosen', async () => {
    await openLoaded()
    vi.spyOn(api, 'updateTicketOwner').mockRejectedValue(
      new api.ApiError(400, 'Owner must be an active IT Staff or Administrator user.', 'VALIDATION_ERROR', 'ownerId'),
    )
    const ops = operations()

    fireEvent.change(ops.getByRole('combobox', { name: 'Ticket Owner' }), { target: { value: '31' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Owner' }))

    expect(await ops.findByRole('alert')).toHaveTextContent('Owner must be an active IT Staff or Administrator user.')
  })
})

describe('Staff Ticket Detail: IT Priority', () => {
  // UI-21 (AC-33)
  it('Update Priority sends the new value, confirms it, and leaves the Requested Priority badge as it was', async () => {
    await openLoaded()
    const request = deferred<StaffTicket>()
    const updateItPriority = vi.spyOn(api, 'updateItPriority').mockReturnValue(request.promise)
    const ops = operations()
    const requested = () => ops.getByText('Requested Priority:').parentElement
    expect(requested()).toHaveTextContent('Requested Priority: Medium')
    expect(within(ops.getByRole('combobox', { name: 'IT Priority' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Low',
      'Medium',
      'High',
    ])
    expect(ops.getByRole('button', { name: 'Update Priority' })).toBeDisabled()

    fireEvent.change(ops.getByRole('combobox', { name: 'IT Priority' }), { target: { value: 'LOW' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Priority' }))

    expect(ops.getByRole('button', { name: 'Update Priority' })).toHaveAttribute('aria-busy', 'true')
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toBeDisabled()
    expect(ops.getByRole('combobox', { name: 'Ticket Owner' })).toBeEnabled()

    request.resolve(ticket({ itPriority: 'LOW' }))

    expect(await ops.findByRole('status')).toHaveTextContent('IT Priority updated.')
    // A notice is about the last save: a later one, of any control, replaces it.
    vi.spyOn(api, 'updateTicketStatus').mockResolvedValue(
      ticket({ itPriority: 'LOW', currentStatus: 'WAITING_FOR_REQUESTER', allowedTransitions: ['IN_PROGRESS'] }),
    )
    fireEvent.change(ops.getByRole('combobox', { name: 'Current Status' }), { target: { value: 'WAITING_FOR_REQUESTER' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Status' }))
    await waitFor(() => expect(ops.getByRole('status')).toHaveTextContent('Status changed to Waiting for Requester.'))
    expect(ops.getAllByRole('status')).toHaveLength(1)
    expect(updateItPriority).toHaveBeenCalledTimes(1)
    expect(updateItPriority).toHaveBeenCalledWith(42, 'LOW')
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toHaveValue('LOW')
    expect(ops.getByRole('button', { name: 'Update Priority' })).toBeDisabled()
    expect(requested()).toHaveTextContent('Requested Priority: Medium')
    expect(information().getByText('Medium')).toBeInTheDocument()
  })

  it('shows the Conflict notice and reloads when the Ticket was finished meanwhile, and the safe failure otherwise', async () => {
    const fetchStaffTicket = await openLoaded()
    const updateItPriority = vi
      .spyOn(api, 'updateItPriority')
      .mockRejectedValueOnce(new api.ApiError(500, SAFE_FAILURE_TEXT, 'INTERNAL_ERROR'))
      .mockRejectedValueOnce(new api.ApiError(409, 'This ticket is closed or cancelled.', 'TICKET_FINISHED'))
    const ops = operations()

    fireEvent.change(ops.getByRole('combobox', { name: 'IT Priority' }), { target: { value: 'LOW' } })
    fireEvent.click(ops.getByRole('button', { name: 'Update Priority' }))

    expect(await ops.findByRole('alert')).toHaveTextContent(SAFE_FAILURE_TEXT)
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toHaveValue('LOW')
    expect(fetchStaffTicket).toHaveBeenCalledTimes(1)

    fetchStaffTicket.mockResolvedValue(ticket({ currentStatus: 'CLOSED', allowedTransitions: [] }))
    fireEvent.click(ops.getByRole('button', { name: 'Update Priority' }))

    await waitFor(() => expect(ops.getByRole('alert')).toHaveTextContent(CONFLICT_TEXT))
    await waitFor(() => expect(fetchStaffTicket).toHaveBeenCalledTimes(2))
    expect(updateItPriority).toHaveBeenCalledTimes(2)
    // The reloaded Ticket is finished: the controls are gone, the notice stays.
    await waitFor(() => expect(ops.queryByRole('combobox')).not.toBeInTheDocument())
    expect(ops.getByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
  })
})

describe('Staff Ticket Detail: Current Status', () => {
  const statusSelect = () => operations().getByRole('combobox', { name: 'Current Status' })
  const chooseStatus = (value: string) => {
    fireEvent.change(statusSelect(), { target: { value } })
    fireEvent.click(operations().getByRole('button', { name: 'Update Status' }))
  }
  const resolved = () =>
    ticket({
      currentStatus: 'RESOLVED',
      allowedTransitions: ['CLOSED', 'REOPENED'],
      resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
      resolvedAt: '2026-10-03T08:00:00.000Z',
    })

  // UI-22 (AC-34)
  it('lists only the allowed transitions, and applies one that needs no confirmation directly', async () => {
    await openLoaded()
    const request = deferred<StaffTicket>()
    const updateTicketStatus = vi.spyOn(api, 'updateTicketStatus').mockReturnValue(request.promise)
    const ops = operations()

    expect(within(statusSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a new status…',
      'Waiting for Requester',
      'Resolved',
      'Cancelled',
    ])
    expect(ops.getByRole('button', { name: 'Update Status' })).toBeDisabled()

    chooseStatus('WAITING_FOR_REQUESTER')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ops.getByRole('button', { name: 'Update Status' })).toHaveAttribute('aria-busy', 'true')
    expect(statusSelect()).toBeDisabled()
    expect(ops.getByRole('combobox', { name: 'IT Priority' })).toBeEnabled()

    request.resolve(
      ticket({ currentStatus: 'WAITING_FOR_REQUESTER', allowedTransitions: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'] }),
    )

    expect(await ops.findByRole('status')).toHaveTextContent('Status changed to Waiting for Requester.')
    expect(updateTicketStatus).toHaveBeenCalledTimes(1)
    expect(updateTicketStatus).toHaveBeenCalledWith(42, { status: 'WAITING_FOR_REQUESTER', expectedStatus: 'IN_PROGRESS' })
    // The returned values, including the new transitions.
    expect(statusSelect()).toHaveValue('')
    expect(within(statusSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a new status…',
      'In Progress',
      'Resolved',
      'Cancelled',
    ])
    expect(within(screen.getByRole('group', { name: 'Ticket status' })).getByText('Waiting for Requester')).toBeInTheDocument()
  })

  // UI-22 (AC-36, BR-30): Closed
  it('asks before closing a Ticket, sends nothing when dismissed, and one request when confirmed', async () => {
    await openLoaded(resolved())
    const updateTicketStatus = vi
      .spyOn(api, 'updateTicketStatus')
      .mockResolvedValue({ ...resolved(), currentStatus: 'CLOSED', allowedTransitions: [] })

    chooseStatus('CLOSED')
    let dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Close TKT-2026-000123? A closed ticket cannot be reopened or changed.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(operations().getByRole('button', { name: 'Update Status' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(operations().getByRole('button', { name: 'Update Status' }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketStatus).not.toHaveBeenCalled()
    // The selection is kept.
    expect(statusSelect()).toHaveValue('CLOSED')

    fireEvent.click(operations().getByRole('button', { name: 'Update Status' }))
    dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Ticket' }))

    expect(await operations().findByRole('status')).toHaveTextContent('Status changed to Closed.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketStatus).toHaveBeenCalledTimes(1)
    expect(updateTicketStatus).toHaveBeenCalledWith(42, { status: 'CLOSED', expectedStatus: 'RESOLVED' })
  })

  // UI-22 (AC-36, BR-30): Cancelled
  it('asks, with a destructive confirmation, before cancelling a Ticket', async () => {
    await openLoaded()
    const updateTicketStatus = vi
      .spyOn(api, 'updateTicketStatus')
      .mockResolvedValue(ticket({ currentStatus: 'CANCELLED', allowedTransitions: [] }))

    chooseStatus('CANCELLED')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Cancel TKT-2026-000123? A cancelled ticket cannot be changed.')
    const confirm = within(dialog).getByRole('button', { name: 'Cancel Ticket' })
    expect(confirm).toHaveClass('btn-outline-danger')
    expect(updateTicketStatus).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketStatus).not.toHaveBeenCalled()

    fireEvent.click(operations().getByRole('button', { name: 'Update Status' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Ticket' }))

    expect(await operations().findByRole('status')).toHaveTextContent('Status changed to Cancelled.')
    expect(updateTicketStatus).toHaveBeenCalledWith(42, { status: 'CANCELLED', expectedStatus: 'IN_PROGRESS' })
  })

  // UI-22 (AC-36): Conflict
  it('shows the Conflict notice and reloads the Ticket when the status was changed by someone else', async () => {
    const fetchStaffTicket = await openLoaded()
    fetchStaffTicket.mockResolvedValue(resolved())
    vi.spyOn(api, 'updateTicketStatus').mockRejectedValue(
      new api.ApiError(409, 'The ticket status was changed by someone else.', 'STATUS_CHANGED'),
    )

    chooseStatus('WAITING_FOR_REQUESTER')

    expect(await operations().findByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
    await waitFor(() => expect(fetchStaffTicket).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(within(statusSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Choose a new status…',
        'Closed',
        'Reopened',
      ]),
    )
    // A choice the Ticket no longer allows is not kept.
    expect(statusSelect()).toHaveValue('')
    expect(operations().getByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
  })

  it('shows the safe failure in the Operations card and keeps the selection when the request fails', async () => {
    await openLoaded()
    vi.spyOn(api, 'updateTicketStatus').mockRejectedValue(new api.ApiError(500, SAFE_FAILURE_TEXT, 'INTERNAL_ERROR'))

    chooseStatus('WAITING_FOR_REQUESTER')

    expect(await operations().findByRole('alert')).toHaveTextContent(SAFE_FAILURE_TEXT)
    expect(statusSelect()).toHaveValue('WAITING_FOR_REQUESTER')
    expect(operations().getByRole('button', { name: 'Update Status' })).toBeEnabled()
  })

  // UI-23 (AC-35, BR-29): with an owner
  it('Resolved opens a dialog that requires a Resolution Summary of 10 to 2000 characters', async () => {
    await openLoaded()
    const updateTicketStatus = vi.spyOn(api, 'updateTicketStatus').mockResolvedValue(resolved())

    chooseStatus('RESOLVED')
    const dialog = within(screen.getByRole('dialog'))
    const summary = dialog.getByRole('textbox', { name: 'Resolution Summary' })
    const submit = dialog.getByRole('button', { name: 'Mark as Resolved' })
    expect(dialog.getByText('Visible to the Requester')).toBeInTheDocument()
    expect(dialog.getByText('0 / 2000')).toBeInTheDocument()
    expect(submit).toHaveClass('btn-primary')

    const cases: Array<[string, string]> = [
      ['', 'A resolution summary is required.'],
      ['   ', 'A resolution summary is required.'],
      ['  123456789  ', 'A resolution summary must be at least 10 characters.'],
      ['x'.repeat(2001), 'A resolution summary must be at most 2000 characters.'],
    ]
    for (const [text, message] of cases) {
      fireEvent.change(summary, { target: { value: text } })
      fireEvent.click(submit)

      expect(dialog.getByText(message)).toBeInTheDocument()
      expect(summary).toHaveAttribute('aria-invalid', 'true')
    }
    expect(dialog.getByText('2001 / 2000')).toBeInTheDocument()
    expect(updateTicketStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.change(summary, { target: { value: '  Replaced the battery; charge now holds for 7 hours.  ' } })
    expect(summary).toHaveAttribute('aria-invalid', 'false')
    fireEvent.click(submit)

    expect(await operations().findByRole('status')).toHaveTextContent('Status changed to Resolved.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketStatus).toHaveBeenCalledTimes(1)
    expect(updateTicketStatus).toHaveBeenCalledWith(42, {
      status: 'RESOLVED',
      expectedStatus: 'IN_PROGRESS',
      resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
    })
    expect(
      within(screen.getByRole('region', { name: 'Resolution Summary' })).getByText(
        'Replaced the battery; charge now holds for 7 hours.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps the Resolved dialog open with what was typed when the API refuses the summary or the request fails, and sends nothing when dismissed', async () => {
    const fetchStaffTicket = await openLoaded()
    const updateTicketStatus = vi
      .spyOn(api, 'updateTicketStatus')
      .mockRejectedValueOnce(
        new api.ApiError(400, 'A resolution summary must be at least 10 characters.', 'VALIDATION_ERROR', 'resolutionSummary'),
      )
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockRejectedValueOnce(new api.ApiError(409, 'A ticket needs an owner before it can be resolved.', 'OWNER_REQUIRED'))

    chooseStatus('RESOLVED')
    const dialog = within(screen.getByRole('dialog'))
    const summary = dialog.getByRole('textbox', { name: 'Resolution Summary' })
    fireEvent.change(summary, { target: { value: 'Replaced the battery.' } })

    fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))
    expect(await dialog.findByText('A resolution summary must be at least 10 characters.')).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(SAFE_FAILURE_TEXT)
    expect(summary).toHaveValue('Replaced the battery.')

    // A 409: the dialog closes on the Conflict notice and the Ticket reloads.
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))
    expect(await operations().findByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchStaffTicket).toHaveBeenCalledTimes(2))
    expect(updateTicketStatus).toHaveBeenCalledTimes(3)

    // Dismissed: nothing is sent.
    chooseStatus('RESOLVED')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    chooseStatus('RESOLVED')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateTicketStatus).toHaveBeenCalledTimes(3)
  })

  // UI-23 (AC-35, BR-29): without an owner
  it('Resolved on a Ticket with no owner explains that it needs one and offers Claim', async () => {
    const unowned = ticket({ owner: null, ownerChangedAt: null })
    await openLoaded(unowned)
    const updateTicketStatus = vi.spyOn(api, 'updateTicketStatus')
    const updateTicketOwner = vi.spyOn(api, 'updateTicketOwner').mockResolvedValue(ticket())

    // The option is still listed.
    chooseStatus('RESOLVED')
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('A ticket needs an owner before it can be resolved.')).toBeInTheDocument()
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Mark as Resolved' })).not.toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Claim' }))

    // Claimed: the same dialog now asks for the summary.
    expect(await dialog.findByRole('textbox', { name: 'Resolution Summary' })).toBeInTheDocument()
    expect(updateTicketOwner).toHaveBeenCalledTimes(1)
    expect(updateTicketOwner).toHaveBeenCalledWith(42, IT_STAFF.id, null)
    expect(updateTicketStatus).not.toHaveBeenCalled()
    expect(dialog.queryByText('A ticket needs an owner before it can be resolved.')).not.toBeInTheDocument()
    // ui-spec.md §12: focus stays inside the dialog, so Escape still closes it.
    expect(dialog.getByRole('textbox', { name: 'Resolution Summary' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Staff Ticket Detail: Public Comments and Internal Notes tabs', () => {
  const tab = (name: RegExp) => screen.getByRole('tab', { name })
  const commentBox = () => screen.getByLabelText('Add a comment')
  const noteBox = () => screen.getByLabelText('Add an internal note')

  // UI-24 (AC-38): distinct label, strip, and button text
  it('makes the Internal Notes tab unmistakably different from Public Comments', async () => {
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([entry({ id: 1, body: 'A public reply.' })])
    vi.spyOn(api, 'fetchInternalNotes').mockResolvedValue([
      entry({ id: 9, body: 'Ordered a replacement.', author: { id: 20, name: 'Apinya Thongchai', role: 'ADMINISTRATOR' } }),
      entry({ id: 8, body: '<b>Battery</b> health 41%\n<script>alert(1)</script>' }),
    ])
    await openLoaded(ticket({ publicCommentCount: 1, internalNoteCount: 2 }))

    // Public Comments is the tab shown first.
    expect(tab(/^Public Comments \(1\)$/)).toHaveAttribute('aria-selected', 'true')
    const comments = within(screen.getByRole('tabpanel', { name: 'Public Comments (1)' }))
    expect(comments.getByText('Visible to the Requester and IT Staff.')).toBeInTheDocument()
    expect(comments.getByText('0 / 2000')).toBeInTheDocument()
    expect(comments.getByRole('button', { name: 'Post Public Comment' })).toHaveClass('btn-primary')
    expect(await comments.findByText('A public reply.')).toBeInTheDocument()
    // The two composers are never visible at once.
    expect(commentBox()).toBeVisible()
    expect(noteBox()).not.toBeVisible()

    // The Internal Notes tab label carries a lock icon beside its text.
    const notesTab = tab(/^Internal Notes \(2\)$/)
    expect(notesTab).toHaveTextContent('🔒')
    fireEvent.click(notesTab)

    expect(notesTab).toHaveAttribute('aria-selected', 'true')
    expect(commentBox()).not.toBeVisible()
    expect(noteBox()).toBeVisible()
    const panel = screen.getByRole('tabpanel', { name: 'Internal Notes (2)' })
    const notes = within(panel)
    expect(panel).toHaveClass('tk-tabs__panel--notes')
    expect(notes.getByText('Internal — never shown to the Requester.')).toBeInTheDocument()
    expect(notes.getByText('0 / 4000')).toBeInTheDocument()
    const add = notes.getByRole('button', { name: 'Add Internal Note' })
    expect(add).toHaveClass('btn-outline-primary')
    expect(add).not.toHaveClass('btn-primary')
    expect(notes.queryByRole('button', { name: /Post/ })).not.toBeInTheDocument()

    // Newest first, each with its author, role badge, and body as text.
    const items = notes.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Apinya Thongchai')
    expect(within(items[0]).getByText('Administrator')).toBeInTheDocument()
    expect(items[0]).toHaveTextContent('Ordered a replacement.')
    expect(within(items[1]).getByText(/<b>Battery<\/b> health 41%/)).toBeInTheDocument()
    expect(panel.querySelector('b, script')).toBeNull()
    expect(api.fetchInternalNotes).toHaveBeenCalledWith(42)
  })

  // UI-24 (AC-38): a separate composer; typed text survives a tab switch
  it('keeps the text typed in one composer while the other tab is visited, and posts each to its own endpoint', async () => {
    const postPublicComment = vi
      .spyOn(api, 'postPublicComment')
      .mockResolvedValue(entry({ id: 51, body: 'We are on it.', createdAt: '2026-10-05T09:30:00.000Z' }))
    const postInternalNote = vi.spyOn(api, 'postInternalNote').mockResolvedValue(entry({ id: 61, body: 'Battery at 41%.' }))
    await openLoaded()
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument()

    fireEvent.change(commentBox(), { target: { value: 'We are on it.' } })
    fireEvent.click(tab(/^Internal Notes/))
    expect(within(screen.getByRole('tabpanel')).getByText('No internal notes yet.')).toBeInTheDocument()
    fireEvent.change(noteBox(), { target: { value: '  Battery at 41%.  ' } })
    fireEvent.click(tab(/^Public Comments/))
    expect(commentBox()).toHaveValue('We are on it.')
    fireEvent.click(tab(/^Internal Notes/))
    expect(noteBox()).toHaveValue('  Battery at 41%.  ')

    // The note goes to the notes endpoint and to nothing else.
    fireEvent.click(screen.getByRole('button', { name: 'Add Internal Note' }))
    const notes = within(await screen.findByRole('tabpanel', { name: 'Internal Notes (1)' }))
    expect(notes.getByRole('status')).toHaveTextContent('Internal note added')
    expect(notes.getAllByRole('listitem')[0]).toHaveTextContent('Battery at 41%.')
    expect(noteBox()).toHaveValue('')
    expect(postInternalNote).toHaveBeenCalledTimes(1)
    expect(postInternalNote).toHaveBeenCalledWith(42, 'Battery at 41%.')
    expect(postPublicComment).not.toHaveBeenCalled()
    // The comment typed earlier is still waiting in its own tab.
    fireEvent.click(tab(/^Public Comments \(0\)$/))
    expect(commentBox()).toHaveValue('We are on it.')

    fireEvent.click(screen.getByRole('button', { name: 'Post Public Comment' }))
    const comments = within(await screen.findByRole('tabpanel', { name: 'Public Comments (1)' }))
    expect(comments.getByRole('status')).toHaveTextContent('Comment posted')
    expect(postPublicComment).toHaveBeenCalledWith(42, 'We are on it.')
    expect(postInternalNote).toHaveBeenCalledTimes(1)
    // A Public Comment moves the Ticket's last-updated time; a note did not.
    expect(information().getByText('Last Updated').parentElement).toHaveTextContent('Oct 5, 2026')
  })

  it('refuses an empty and an over-long note without a request, and shows the Conflict notice when the Ticket was finished meanwhile', async () => {
    const fetchStaffTicket = await openLoaded()
    const postInternalNote = vi
      .spyOn(api, 'postInternalNote')
      .mockRejectedValue(new api.ApiError(409, 'This ticket is closed or cancelled.', 'TICKET_FINISHED'))
    fireEvent.click(tab(/^Internal Notes/))
    const notes = within(screen.getByRole('tabpanel'))
    const add = notes.getByRole('button', { name: 'Add Internal Note' })

    fireEvent.click(add)
    expect(notes.getByText('A note is required.')).toBeInTheDocument()
    fireEvent.change(noteBox(), { target: { value: 'x'.repeat(4001) } })
    fireEvent.click(add)
    expect(notes.getByText('A note must be at most 4000 characters.')).toBeInTheDocument()
    expect(notes.getByText('4001 / 4000')).toBeInTheDocument()
    expect(postInternalNote).not.toHaveBeenCalled()

    fetchStaffTicket.mockResolvedValue(ticket({ currentStatus: 'CLOSED', allowedTransitions: [] }))
    fireEvent.change(noteBox(), { target: { value: 'One more thing.' } })
    fireEvent.click(add)

    expect(await notes.findByRole('alert')).toHaveTextContent(CONFLICT_TEXT)
    await waitFor(() => expect(notes.queryByRole('textbox')).not.toBeInTheDocument())
    expect(notes.getByText('This ticket is closed and can no longer be changed.')).toBeInTheDocument()
  })

  // ui-spec.md §12: the tab pattern
  it('moves between tabs with the arrow keys, and labels each panel by its tab', async () => {
    await openLoaded()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[1].id)

    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveFocus()
  })
})

describe('Staff Ticket Detail on a finished Ticket', () => {
  // UI-25 (AC-37)
  it.each([
    { status: 'CLOSED', as: 'closed', label: 'Closed' },
    { status: 'CANCELLED', as: 'cancelled', label: 'Cancelled' },
  ] as const)('is read-only when $status: no operational control and no composer', async ({ status, as, label }) => {
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([entry({ id: 1, body: 'A public reply.' })])
    await openLoaded(
      ticket({
        currentStatus: status,
        allowedTransitions: [],
        owner: null,
        publicCommentCount: 1,
        attachments: [
          {
            id: 5,
            originalFilename: 'screenshot.png',
            mimeType: 'image/png',
            sizeBytes: 204800,
            createdAt: '2026-10-01T02:16:00.000Z',
            removedAt: null,
            removedByRequesterId: null,
            removalReason: null,
          },
        ],
      }),
    )

    // The Operations card shows the same values, read-only.
    const ops = operations()
    expect(ops.getByText(`This ticket is ${as} and can no longer be changed.`)).toBeInTheDocument()
    expect(ops.getByText('Ticket Owner').nextElementSibling).toHaveTextContent('Unassigned')
    expect(ops.getByText('IT Priority').nextElementSibling).toHaveTextContent('High')
    expect(ops.getByText('Current Status').nextElementSibling).toHaveTextContent(label)
    for (const role of ['combobox', 'button', 'textbox']) {
      expect(ops.queryAllByRole(role)).toEqual([])
    }

    // No composer in either tab, shown or not; reading still works.
    expect(screen.queryAllByRole('textbox', { hidden: true })).toEqual([])
    expect(screen.queryByRole('button', { name: /Post Public Comment|Add Internal Note|Claim/, hidden: true })).toBeNull()
    expect(await screen.findByText('A public reply.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^Internal Notes/ }))
    expect(within(screen.getByRole('tabpanel')).getByText(`This ticket is ${as} and can no longer be changed.`)).toBeInTheDocument()

    // Download remains.
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments (1)' }))
    expect(screen.getByRole('button', { name: 'Download screenshot.png' })).toBeInTheDocument()
  })
})

describe('Staff Ticket Detail and the Ticket Queue', () => {
  // ui-spec.md §9.1: "Back to Queue" restores the queue view
  it('goes back to the queue view the Ticket was opened from', async () => {
    vi.spyOn(api, 'fetchCategories').mockResolvedValue([{ id: 2, name: 'Hardware' }])
    const fetchStaffQueue = vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue({
      data: [{ ...ticket(), requester: { id: 7, name: 'Somchai Jaidee' } }],
      meta: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 },
    })
    vi.spyOn(api, 'fetchStaffTicket').mockResolvedValue(ticket())
    openDetail(IT_STAFF, '/staff/queue?itPriority=HIGH&page=2')

    fireEvent.click((await screen.findAllByRole('link', { name: 'TKT-2026-000123' }))[0])
    await screen.findByRole('heading', { level: 1, name: 'TKT-2026-000123' })
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Ticket Queue' })).toHaveAttribute(
      'href',
      '/staff/queue?itPriority=HIGH&page=2',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to Queue' }))

    expect(await screen.findByRole('heading', { name: 'Ticket Queue' })).toBeInTheDocument()
    expect(window.location.pathname + window.location.search).toBe('/staff/queue?itPriority=HIGH&page=2')
    expect(fetchStaffQueue).toHaveBeenLastCalledWith(expect.objectContaining({ itPriority: 'HIGH', page: 2 }))
  })

  it('goes back to the queue at its defaults when the Ticket was opened by its address', async () => {
    vi.spyOn(api, 'fetchCategories').mockResolvedValue([])
    vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    })
    await openLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Queue' }))

    expect(await screen.findByRole('heading', { name: 'Ticket Queue' })).toBeInTheDocument()
    expect(window.location.pathname + window.location.search).toBe('/staff/queue')
  })
})
