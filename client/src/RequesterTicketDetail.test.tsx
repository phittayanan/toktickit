import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import RequesterTicketDetail from './RequesterTicketDetail'
import { SessionContext } from './sessionContextObject'
import * as api from './api'
import type { TicketDetail, TicketAttachment } from './api'
import { REQUESTER } from './test/session'

// The signed-in Requester is the acting identity (docs/lab-03 FR-09).
function renderDetail(ticketId: number, onBack: () => void = vi.fn()) {
  return render(
    <SessionContext.Provider value={{ user: REQUESTER, sessionEnded: false, signIn: vi.fn(), signOut: vi.fn() }}>
      <RequesterTicketDetail ticketId={ticketId} onBack={onBack} />
    </SessionContext.Provider>,
  )
}

const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Wi-Fi' }]

const TICKET: TicketDetail = {
  id: 42,
  ticketNumber: 'TKT-2026-000123',
  requesterId: 7,
  categoryId: 1,
  relatedSystemId: 1,
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
  requestedPriority: 'MEDIUM',
  itPriority: null,
  currentStatus: 'NEW',
  createdAt: '2026-08-23T10:15:00.000Z',
  updatedAt: '2026-08-23T10:15:00.000Z',
  attachments: [],
  ownerName: null,
  resolutionSummary: null,
  resolvedAt: null,
  requesterResolvedAt: null,
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
  vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([])
  vi.spyOn(api, 'fetchActionsTaken').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RequesterTicketDetail', () => {
  // UI-14 (AC-25, AC-26): all required fields rendered read-only
  it('renders all required fields read-only', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue(TICKET)

    renderDetail(42)

    await waitFor(() => {
      expect(screen.getAllByText('TKT-2026-000123').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument()
    expect(screen.getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(
      screen.getByText('My laptop battery is draining much faster than usual over the past week.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Not yet set')).toBeInTheDocument() // IT Priority, null

    // Read-only fields render as non-editable containers, not form inputs.
    // Scoped to the field grid: the screen now also has the Public Comment
    // composer (docs/lab-03/ui-spec.md §7.3).
    const grid = screen.getByText('Ticket Number', { selector: '.form-label' }).closest('.row') as HTMLElement
    expect(within(grid).queryByRole('textbox')).not.toBeInTheDocument()
  })

  // AC-03/ADR-0004: a nonexistent Ticket -> a clear "not found" state
  it('shows a not-found state for a nonexistent Ticket', async () => {
    vi.spyOn(api, 'fetchTicketById').mockRejectedValue(new Error('Ticket not found'))

    renderDetail(999)

    await waitFor(() => {
      expect(screen.getByText(/ticket not found/i)).toBeInTheDocument()
    })
  })

  // AC-03/ADR-0004: another Requester's Ticket -> the same not-found state
  it('shows the same not-found state for a Ticket owned by another Requester', async () => {
    vi.spyOn(api, 'fetchTicketById').mockRejectedValue(new Error('Ticket not found'))

    renderDetail(7)

    await waitFor(() => {
      expect(screen.getByText(/ticket not found/i)).toBeInTheDocument()
    })
  })

  // docs/lab-03/ui-spec.md §2.3: a Ticket that cannot be loaded shows the
  // safe failure, never the error's own text, and Retry loads it again.
  it.each([
    ['a lost connection', new Error('Unable to connect to TokTickIT API')],
    ['a 500', new api.ApiError(500, 'relation "tickets" does not exist', 'INTERNAL_ERROR')],
  ])('shows the safe failure with Retry when %s stops the Ticket loading, and loads it on Retry', async (_name, failure) => {
    const fetchTicket = vi.spyOn(api, 'fetchTicketById').mockRejectedValueOnce(failure).mockResolvedValue(TICKET)

    renderDetail(42)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Something went wrong. Please try again. Retry')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'TKT-2026-000123' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchTicket).toHaveBeenCalledTimes(2)
    expect(fetchTicket).toHaveBeenLastCalledWith(42)
  })

  it('keeps the safe failure with Retry when the Ticket cannot be loaded again', async () => {
    vi.spyOn(api, 'fetchTicketById').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))

    renderDetail(42)

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(api.fetchTicketById).toHaveBeenCalledTimes(2))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('calls onBack when Back to My Tickets is clicked', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue(TICKET)
    const onBack = vi.fn()

    renderDetail(42, onBack)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    fireEvent.click(screen.getByRole('button', { name: /back to my tickets/i }))
    expect(onBack).toHaveBeenCalled()
  })

  // Public Comments are on this screen from Lab 3 (docs/lab-03/ui-spec.md
  // §7.3) and the read-only Actions Taken card from Lab 4
  // (docs/lab-04/ui-spec.md §8.6); Internal Notes and a status control are not.
  it('does not render any status-change, notes, or actions UI', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue(TICKET)

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/action taken/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /status/i })).not.toBeInTheDocument()
  })
})

const ACTIVE_ATTACHMENT: TicketAttachment = {
  id: 1,
  ticketId: 42,
  originalFilename: 'screenshot.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  createdAt: '2026-08-23T10:16:00.000Z',
  removedAt: null,
  removedByRequesterId: null,
  removalReason: null,
}

const REMOVED_ATTACHMENT: TicketAttachment = {
  id: 2,
  ticketId: 42,
  originalFilename: 'old-notes.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 4096,
  createdAt: '2026-08-22T10:16:00.000Z',
  removedAt: '2026-08-23T09:00:00.000Z',
  removedByRequesterId: 7,
  removalReason: 'Uploaded the wrong file',
}

describe('RequesterTicketDetail attachments (#22)', () => {
  it('lists active attachments with a download and a remove control', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [ACTIVE_ATTACHMENT] })

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download screenshot.png/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove screenshot.png/i })).toBeInTheDocument()
  })

  it('lists removed attachments as muted metadata with no download control', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [REMOVED_ATTACHMENT] })

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    expect(screen.getByText('old-notes.pdf')).toBeInTheDocument()
    expect(screen.getByText(/uploaded the wrong file/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download old-notes.pdf/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove old-notes.pdf/i })).not.toBeInTheDocument()
  })

  it('downloads an active attachment via the API', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [ACTIVE_ATTACHMENT] })
    const downloadSpy = vi.spyOn(api, 'downloadAttachment').mockResolvedValue()

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    fireEvent.click(screen.getByRole('button', { name: /download screenshot.png/i }))

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith(1, 'screenshot.png'))
  })

  it('requires a reason before confirming removal', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [ACTIVE_ATTACHMENT] })
    const removeSpy = vi.spyOn(api, 'removeAttachment')

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    fireEvent.click(screen.getByRole('button', { name: /remove screenshot.png/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }))

    await waitFor(() => {
      expect(screen.getByText(/removal reason.*required/i)).toBeInTheDocument()
    })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('soft-removes an attachment once a valid reason is given', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [ACTIVE_ATTACHMENT] })
    vi.spyOn(api, 'removeAttachment').mockResolvedValue({
      ...ACTIVE_ATTACHMENT,
      removedAt: '2026-08-23T11:00:00.000Z',
      removedByRequesterId: 7,
      removalReason: 'No longer needed',
    })

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    fireEvent.click(screen.getByRole('button', { name: /remove screenshot.png/i }))
    fireEvent.change(screen.getByLabelText(/reason for removal/i), { target: { value: 'No longer needed' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /download screenshot.png/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText(/no longer needed/i)).toBeInTheDocument()
  })

  it('rejects an unsupported file type before uploading', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [] })
    const uploadSpy = vi.spyOn(api, 'uploadAttachment')

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument()
    })
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it('uploads a valid new attachment and adds it to the active list', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, attachments: [] })
    vi.spyOn(api, 'uploadAttachment').mockResolvedValue({
      id: 9,
      ticketId: 42,
      originalFilename: 'new-photo.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      createdAt: '2026-08-23T12:00:00.000Z',
    })

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    const file = new File(['x'], 'new-photo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('new-photo.png')).toBeInTheDocument()
    })
  })
})

// docs/lab-03/ui-spec.md §7: the Lab 3 additions.

async function renderTicket(ticket: Partial<TicketDetail> = {}) {
  vi.spyOn(api, 'fetchTicketById').mockResolvedValue({ ...TICKET, itPriority: 'MEDIUM', ...ticket })
  renderDetail(42)
  await screen.findByRole('heading', { name: 'TKT-2026-000123' })
}

// The read-only value shown under a field-grid label.
function fieldValue(label: string): HTMLElement {
  return screen.getByText(label, { selector: '.form-label' }).nextElementSibling as HTMLElement
}

// UI-10 (AC-22, AC-23, ui-spec.md §7.1)
describe('RequesterTicketDetail field grid (Lab 3)', () => {
  it.each([
    ['NEW', 'New'],
    ['OPEN', 'Open'],
    ['IN_PROGRESS', 'In Progress'],
    ['WAITING_FOR_REQUESTER', 'Waiting for Requester'],
    ['RESOLVED', 'Resolved'],
    ['CLOSED', 'Closed'],
    ['REOPENED', 'Reopened'],
    ['CANCELLED', 'Cancelled'],
  ])('shows the Current Status badge for %s', async (currentStatus, label) => {
    await renderTicket({ currentStatus })

    expect(fieldValue('Current Status')).toHaveTextContent(label)
  })

  it('shows the Ticket Owner by name, or Unassigned', async () => {
    await renderTicket({ currentStatus: 'IN_PROGRESS', ownerName: 'Wichai Phromma' })
    expect(fieldValue('Ticket Owner')).toHaveTextContent('Wichai Phromma')

    cleanup()
    await renderTicket({ ownerName: null })
    expect(fieldValue('Ticket Owner')).toHaveTextContent('Unassigned')
  })

  it('shows the Resolution Summary with its date only when there is one', async () => {
    await renderTicket({ currentStatus: 'IN_PROGRESS', ownerName: 'Wichai Phromma' })
    expect(screen.queryByText('Resolution Summary')).not.toBeInTheDocument()

    cleanup()
    await renderTicket({
      currentStatus: 'RESOLVED',
      ownerName: 'Wichai Phromma',
      resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
      resolvedAt: '2026-10-03T08:00:00.000Z',
    })

    const panel = screen.getByRole('region', { name: 'Resolution Summary' })
    expect(panel).toHaveTextContent('Replaced the battery; charge now holds for 7 hours.')
    expect(panel).toHaveTextContent(`Resolved on ${new Date('2026-10-03T08:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`)
  })

  it('offers no status, owner, or priority control', async () => {
    await renderTicket({
      currentStatus: 'RESOLVED',
      ownerName: 'Wichai Phromma',
      resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
      resolvedAt: '2026-10-03T08:00:00.000Z',
    })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /status|owner|claim|assign|priority|resolve|close|cancel|reopen/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument()
  })
})

const INDICATED_AT = '2026-10-02T04:00:00.000Z'
const INDICATED_ON = new Date(INDICATED_AT).toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
const CONFLICT_NOTICE = 'This ticket was changed by someone else. The latest details are shown below.'

const resolvedCard = () => screen.queryByRole('region', { name: 'Problem Appears Resolved' })

// UI-12 (AC-21, ui-spec.md §7.2)
describe('RequesterTicketDetail Problem Appears Resolved', () => {
  it.each(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'])(
    'offers Problem Appears Resolved on a %s Ticket that is not indicated',
    async (currentStatus) => {
      await renderTicket({ currentStatus })

      expect(resolvedCard()).toHaveTextContent(
        'Is the problem fixed? Let IT know. IT Staff decide when the ticket is resolved.',
      )
      expect(screen.getByRole('button', { name: 'Problem Appears Resolved' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
    },
  )

  it('sets the indication: the button is busy meanwhile, then the card says when IT was told', async () => {
    let answer!: (value: api.ResolutionIndication) => void
    const setSpy = vi
      .spyOn(api, 'setResolutionIndication')
      .mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    fireEvent.click(screen.getByRole('button', { name: 'Problem Appears Resolved' }))

    const button = screen.getByRole('button', { name: 'Problem Appears Resolved' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledWith(42)

    answer({ requesterResolvedAt: INDICATED_AT })

    await waitFor(() => {
      expect(resolvedCard()).toHaveTextContent(
        `You told IT on ${INDICATED_ON} that the problem appears resolved. IT Staff will review it.`,
      )
    })
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Problem Appears Resolved' })).not.toBeInTheDocument()
    expect(within(resolvedCard()!).getByRole('status')).toBeInTheDocument()
    // The status is IT Staff's to change, not this action's.
    expect(fieldValue('Current Status')).toHaveTextContent('In Progress')
  })

  it('withdraws the indication', async () => {
    const withdrawSpy = vi.spyOn(api, 'withdrawResolutionIndication').mockResolvedValue({ requesterResolvedAt: null })
    await renderTicket({ currentStatus: 'OPEN', requesterResolvedAt: INDICATED_AT })

    expect(resolvedCard()).toHaveTextContent(`You told IT on ${INDICATED_ON} that the problem appears resolved.`)
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    await screen.findByRole('button', { name: 'Problem Appears Resolved' })
    expect(withdrawSpy).toHaveBeenCalledWith(42)
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
    expect(within(resolvedCard()!).getByRole('status')).toBeInTheDocument()
  })

  it('shows text only, and no button, on a Resolved Ticket', async () => {
    await renderTicket({ currentStatus: 'RESOLVED' })

    expect(resolvedCard()).toHaveTextContent(
      'IT has marked this ticket resolved. If the problem has returned, say so in a comment below.',
    )
    expect(within(resolvedCard()!).queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(['CLOSED', 'CANCELLED'])('is not shown on a %s Ticket', async (currentStatus) => {
    await renderTicket({ currentStatus, requesterResolvedAt: INDICATED_AT })

    expect(resolvedCard()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /problem appears resolved|withdraw/i })).not.toBeInTheDocument()
  })

  it('shows the Conflict notice and the latest Ticket when it was resolved meanwhile', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchTicketById')
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'RESOLVED' })
    vi.spyOn(api, 'setResolutionIndication').mockRejectedValue(
      new api.ApiError(409, 'This ticket is already resolved.', 'INDICATION_NOT_AVAILABLE'),
    )
    renderDetail(42)

    fireEvent.click(await screen.findByRole('button', { name: 'Problem Appears Resolved' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
    await waitFor(() => expect(fieldValue('Current Status')).toHaveTextContent('Resolved'))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(resolvedCard()).toHaveTextContent('IT has marked this ticket resolved.')
    expect(screen.queryByRole('button', { name: 'Problem Appears Resolved' })).not.toBeInTheDocument()
  })

  it('shows the Conflict notice, and no card, when the Ticket was finished meanwhile', async () => {
    vi.spyOn(api, 'fetchTicketById')
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'OPEN', requesterResolvedAt: INDICATED_AT })
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'CANCELLED', requesterResolvedAt: INDICATED_AT })
    vi.spyOn(api, 'withdrawResolutionIndication').mockRejectedValue(
      new api.ApiError(409, 'This ticket is closed or cancelled and can no longer be changed.', 'TICKET_FINISHED'),
    )
    renderDetail(42)

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
    await waitFor(() => expect(fieldValue('Current Status')).toHaveTextContent('Cancelled'))
    expect(resolvedCard()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })

  it.each([
    ['a lost connection', new Error('Unable to connect to TokTickIT API')],
    ['a 500', new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR')],
  ])('shows the safe failure and keeps the card as it was after %s', async (_case, failure) => {
    const fetchSpy = vi.spyOn(api, 'fetchTicketById')
    vi.spyOn(api, 'setResolutionIndication').mockRejectedValue(failure)
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    fireEvent.click(screen.getByRole('button', { name: 'Problem Appears Resolved' }))

    expect(await within(resolvedCard()!).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(screen.getByRole('button', { name: 'Problem Appears Resolved' })).toBeEnabled()
    expect(within(resolvedCard()!).queryByRole('status')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

const STAFF_COMMENT: api.Entry = {
  id: 31,
  body: 'We are checking the VPN gateway logs.',
  createdAt: '2026-10-02T03:15:00.000Z',
  author: { id: 12, name: 'Wichai Phromma', role: 'IT_STAFF' },
}

const OWN_COMMENT: api.Entry = {
  id: 30,
  body: 'It still drains within two hours.',
  createdAt: '2026-10-01T09:00:00.000Z',
  author: { id: 7, name: 'Somchai Jaidee', role: 'REQUESTER' },
}

const commentsCard = () => screen.getByRole('region', { name: /^Public Comments/ })
const commentItems = () => within(commentsCard()).queryAllByRole('listitem')

// UI-11 (AC-20, ui-spec.md §7.3)
describe('RequesterTicketDetail Public Comments', () => {
  it('shows skeleton rows while the comments load, then the list, newest first, with its count', async () => {
    let answer!: (value: api.Entry[]) => void
    const fetchSpy = vi
      .spyOn(api, 'fetchPublicComments')
      .mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    // The skeleton is in the document before the effect that asks has run.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(42))
    expect(within(commentsCard()).getByRole('status')).toHaveTextContent('Loading comments…')
    expect(commentsCard().querySelectorAll('.tk-skeleton').length).toBeGreaterThan(0)
    expect(commentItems()).toHaveLength(0)

    // The API answers newest first.
    answer([STAFF_COMMENT, OWN_COMMENT])

    await waitFor(() => expect(commentItems()).toHaveLength(2))
    expect(commentsCard().querySelectorAll('.tk-skeleton')).toHaveLength(0)
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments (2)' })).toBeInTheDocument()
    expect(commentsCard()).toHaveTextContent('Visible to you and IT Staff.')

    const [first, second] = commentItems()
    expect(first).toHaveTextContent('We are checking the VPN gateway logs.')
    expect(first).toHaveTextContent('Wichai Phromma')
    // The author's role badge, the initials avatar, and the date and time.
    expect(within(first).getByText('IT Staff')).toHaveClass('badge')
    expect(within(first).getByText('WP')).toBeInTheDocument()
    expect(first).toHaveTextContent(new Date(STAFF_COMMENT.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))
    expect(second).toHaveTextContent('It still drains within two hours.')
    expect(within(second).getByText('Requester')).toHaveClass('badge')
  })

  const composer = () => within(commentsCard()).getByLabelText('Add a comment') as HTMLTextAreaElement
  const postButton = () => within(commentsCard()).getByRole('button', { name: 'Post Comment' })
  const type = (value: string) => fireEvent.change(composer(), { target: { value } })

  it('counts the characters typed and refuses an empty, a whitespace-only, and an over-long comment without a request', async () => {
    const postSpy = vi.spyOn(api, 'postPublicComment')
    await renderTicket({ currentStatus: 'IN_PROGRESS' })
    await within(commentsCard()).findByText('No comments yet.')

    expect(commentsCard()).toHaveTextContent('0 / 2000')
    type('Hello')
    expect(commentsCard()).toHaveTextContent('5 / 2000')

    for (const [value, message] of [
      ['', 'A comment is required.'],
      ['   \n ', 'A comment is required.'],
      ['x'.repeat(2001), 'A comment must be at most 2000 characters.'],
    ]) {
      type(value)
      fireEvent.click(postButton())

      // The message is tied to the textarea it sits under.
      expect(composer()).toBeInvalid()
      expect(composer()).toHaveAccessibleDescription(expect.stringContaining(message))
    }
    expect(postSpy).not.toHaveBeenCalled()

    // Editing the textarea removes the message.
    type('Better')
    expect(composer()).toBeValid()
  })

  it('posts a comment: busy meanwhile, then the entry is on top, the composer is clear, and the count is up', async () => {
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([OWN_COMMENT])
    let answer!: (value: api.Entry) => void
    const postSpy = vi.spyOn(api, 'postPublicComment').mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await renderTicket({ currentStatus: 'IN_PROGRESS' })
    await waitFor(() => expect(commentItems()).toHaveLength(1))

    type('  Still happening after the update.\nSee the attached log.  ')
    fireEvent.click(postButton())

    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith(42, 'Still happening after the update.\nSee the attached log.')
    expect(postButton()).toBeDisabled()
    expect(postButton()).toHaveAttribute('aria-busy', 'true')
    expect(composer()).toHaveAttribute('readonly')

    answer({
      id: 32,
      body: 'Still happening after the update.\nSee the attached log.',
      createdAt: '2026-10-02T05:00:00.000Z',
      author: { id: 7, name: 'Somchai Jaidee', role: 'REQUESTER' },
    })

    await waitFor(() => expect(commentItems()).toHaveLength(2))
    expect(commentItems()[0]).toHaveTextContent('Still happening after the update.')
    expect(commentItems()[1]).toHaveTextContent('It still drains within two hours.')
    expect(composer()).toHaveValue('')
    expect(composer()).not.toHaveAttribute('readonly')
    expect(postButton()).toBeEnabled()
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments (2)' })).toBeInTheDocument()
    expect(within(commentsCard()).getByRole('status')).toHaveTextContent('Comment posted')
  })

  it.each([
    ['a lost connection', new Error('Unable to connect to TokTickIT API')],
    ['a 500', new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR')],
  ])('keeps the typed text and shows the safe failure in the card after %s', async (_case, failure) => {
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([OWN_COMMENT])
    vi.spyOn(api, 'postPublicComment').mockRejectedValue(failure)
    await renderTicket({ currentStatus: 'IN_PROGRESS' })
    await waitFor(() => expect(commentItems()).toHaveLength(1))

    type('Still happening after the update.')
    fireEvent.click(postButton())

    expect(await within(commentsCard()).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(composer()).toHaveValue('Still happening after the update.')
    expect(composer()).not.toHaveAttribute('readonly')
    expect(postButton()).toBeEnabled()
    expect(commentItems()).toHaveLength(1)
    expect(within(commentsCard()).queryByRole('status')).not.toBeInTheDocument()
  })

  it("shows the API's own message under the textarea when it refuses the body", async () => {
    vi.spyOn(api, 'postPublicComment').mockRejectedValue(
      new api.ApiError(400, 'A comment must be at most 2000 characters.', 'VALIDATION_ERROR', 'body'),
    )
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    type('A comment the server refuses.')
    fireEvent.click(postButton())

    await waitFor(() => expect(composer()).toBeInvalid())
    expect(composer()).toHaveAccessibleDescription(
      expect.stringContaining('A comment must be at most 2000 characters.'),
    )
    expect(composer()).toHaveValue('A comment the server refuses.')
    expect(within(commentsCard()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the Conflict notice and replaces the composer when the Ticket was finished meanwhile', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchTicketById')
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ ...TICKET, currentStatus: 'CLOSED' })
    vi.spyOn(api, 'postPublicComment').mockRejectedValue(
      new api.ApiError(409, 'This ticket is closed or cancelled and can no longer be changed.', 'TICKET_FINISHED'),
    )
    renderDetail(42)
    await screen.findByRole('heading', { name: 'TKT-2026-000123' })

    type('One more thing.')
    fireEvent.click(postButton())

    expect(await within(commentsCard()).findByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
    await waitFor(() => expect(fieldValue('Current Status')).toHaveTextContent('Closed'))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(within(commentsCard()).queryByLabelText('Add a comment')).not.toBeInTheDocument()
    expect(within(commentsCard()).queryByRole('button', { name: 'Post Comment' })).not.toBeInTheDocument()
    expect(commentsCard()).toHaveTextContent('This ticket is closed. Create a new ticket if you need more help.')
    // The notice outlives the reload.
    expect(within(commentsCard()).getByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
  })

  it('shows the safe failure with Retry when the comments cannot be loaded, and loads them on Retry', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchPublicComments')
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValueOnce([STAFF_COMMENT])
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    expect(await within(commentsCard()).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(commentItems()).toHaveLength(0)
    expect(within(commentsCard()).queryByText('No comments yet.')).not.toBeInTheDocument()

    fireEvent.click(within(commentsCard()).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(commentItems()).toHaveLength(1))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(within(commentsCard()).queryByRole('alert')).not.toBeInTheDocument()
  })

  const POSTED_COMMENT: api.Entry = {
    id: 32,
    body: 'Still happening after the update.',
    createdAt: '2026-10-02T05:00:00.000Z',
    author: { id: 7, name: 'Somchai Jaidee', role: 'REQUESTER' },
  }

  it('loads the comments again after a post when they could not be loaded, and keeps Retry when that fails too', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchPublicComments')
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValueOnce([POSTED_COMMENT, STAFF_COMMENT, OWN_COMMENT])
    vi.spyOn(api, 'postPublicComment').mockResolvedValue(POSTED_COMMENT)
    await renderTicket({ currentStatus: 'IN_PROGRESS' })
    await within(commentsCard()).findByRole('button', { name: 'Retry' })

    type('Still happening after the update.')
    fireEvent.click(postButton())

    expect(await within(commentsCard()).findByRole('status')).toHaveTextContent('Comment posted')
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    // The earlier comments are still unknown: no list and no count.
    expect(await within(commentsCard()).findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(commentsCard()).getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(commentItems()).toHaveLength(0)
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments' })).toBeInTheDocument()
    expect(composer()).toHaveValue('')

    fireEvent.click(within(commentsCard()).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(commentItems()).toHaveLength(3))
    expect(commentItems()[0]).toHaveTextContent('Still happening after the update.')
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments (3)' })).toBeInTheDocument()
    expect(within(commentsCard()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('loads the comments again after a post made while they were loading, and ignores the earlier answer', async () => {
    let answerFirstLoad!: (value: api.Entry[]) => void
    const fetchSpy = vi
      .spyOn(api, 'fetchPublicComments')
      .mockReturnValueOnce(new Promise((resolve) => (answerFirstLoad = resolve)))
      .mockResolvedValueOnce([POSTED_COMMENT, OWN_COMMENT])
    vi.spyOn(api, 'postPublicComment').mockResolvedValue(POSTED_COMMENT)
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    type('Still happening after the update.')
    fireEvent.click(postButton())

    await waitFor(() => expect(commentItems()).toHaveLength(2))
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // The load that began before the post answers without the new comment.
    answerFirstLoad([OWN_COMMENT])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(commentItems()).toHaveLength(2)
    expect(commentItems()[0]).toHaveTextContent('Still happening after the update.')
    expect(commentItems()[1]).toHaveTextContent('It still drains within two hours.')
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments (2)' })).toBeInTheDocument()
    expect(within(commentsCard()).getByRole('status')).toHaveTextContent('Comment posted')
  })

  it('says so when there are no comments yet', async () => {
    await renderTicket({ currentStatus: 'IN_PROGRESS' })

    expect(await within(commentsCard()).findByText('No comments yet.')).toBeInTheDocument()
    expect(within(commentsCard()).getByRole('heading', { name: 'Public Comments (0)' })).toBeInTheDocument()
  })
})

// UI-13 (AC-37, BR-31, ui-spec.md §7.3 and §7.4)
describe('RequesterTicketDetail on a finished Ticket', () => {
  it.each([
    ['CLOSED', 'This ticket is closed. Create a new ticket if you need more help.'],
    ['CANCELLED', 'This ticket is cancelled. Create a new ticket if you need more help.'],
  ])('is read-only when %s: no composer, no Add Attachment, no Remove; Download stays', async (currentStatus, text) => {
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([STAFF_COMMENT])
    const downloadSpy = vi.spyOn(api, 'downloadAttachment').mockResolvedValue()
    await renderTicket({ currentStatus, attachments: [ACTIVE_ATTACHMENT, REMOVED_ATTACHMENT] })
    await waitFor(() => expect(commentItems()).toHaveLength(1))

    // The comments stay readable; the composer is replaced by text.
    expect(commentsCard()).toHaveTextContent(text)
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post Comment' })).not.toBeInTheDocument()

    expect(screen.queryByLabelText(/add attachment/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(resolvedCard()).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    expect(screen.getByText('old-notes.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /download screenshot.png/i }))
    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith(1, 'screenshot.png'))
  })
})

// UI-13 (BR-31, ui-spec.md §2.3 and §7.4): the Ticket was finished while
// this screen was open.
describe('RequesterTicketDetail Attachments on a Ticket finished meanwhile', () => {
  const answerTicketFinished = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'This ticket is closed or cancelled and can no longer be changed.',
              code: 'TICKET_FINISHED',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

  // The Ticket as first loaded, then a reload that answers when told to.
  function loadThenReload() {
    const open = { ...TICKET, currentStatus: 'IN_PROGRESS', attachments: [ACTIVE_ATTACHMENT] }
    let finish!: () => void
    const fetchSpy = vi
      .spyOn(api, 'fetchTicketById')
      .mockResolvedValueOnce(open)
      .mockReturnValueOnce(
        new Promise((resolve) => (finish = () => resolve({ ...open, currentStatus: 'CLOSED' }))),
      )

    return { fetchSpy, finish: () => finish() }
  }

  async function expectFinishedAttachments() {
    await waitFor(() => expect(fieldValue('Current Status')).toHaveTextContent('Closed'))
    expect(screen.queryByLabelText(/add attachment/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download screenshot.png/i })).toBeInTheDocument()
    // The notice outlives the reload.
    expect(screen.getByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the Conflict notice and the latest Ticket when an upload is refused', async () => {
    const { fetchSpy, finish } = loadThenReload()
    answerTicketFinished()
    renderDetail(42)
    await screen.findByRole('heading', { name: 'TKT-2026-000123' })
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'One more thing.' } })

    const file = new File(['x'], 'new-photo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/add attachment/i), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    // What was typed elsewhere on the screen is kept.
    expect(screen.getByLabelText('Add a comment')).toHaveValue('One more thing.')

    finish()

    await expectFinishedAttachments()
    expect(screen.queryByText('new-photo.png')).not.toBeInTheDocument()
  })

  it('shows the Conflict notice and the latest Ticket when a soft removal is refused', async () => {
    const { fetchSpy, finish } = loadThenReload()
    answerTicketFinished()
    renderDetail(42)
    await screen.findByRole('heading', { name: 'TKT-2026-000123' })

    fireEvent.click(screen.getByRole('button', { name: /remove screenshot.png/i }))
    fireEvent.change(screen.getByLabelText(/reason for removal/i), { target: { value: 'No longer needed' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_NOTICE)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    // The typed reason is kept.
    expect(screen.getByLabelText(/reason for removal/i)).toHaveValue('No longer needed')

    finish()

    await expectFinishedAttachments()
  })
})

// UI-14 (AC-39, BR-35)
describe('RequesterTicketDetail comment markup', () => {
  it('renders a comment body containing markup as literal text, and injects no element', async () => {
    const body = '<script>window.injected = true</script>\n<b>bold</b> <img src=x onerror="window.injected = true"> &amp;'
    vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([{ ...STAFF_COMMENT, body }])
    await renderTicket({ currentStatus: 'IN_PROGRESS' })
    await waitFor(() => expect(commentItems()).toHaveLength(1))

    const text = commentItems()[0].querySelector('.tk-comment__body') as HTMLElement
    expect(text.textContent).toBe(body)
    expect(text.children).toHaveLength(0)
    expect(commentsCard().querySelector('script, b, img')).toBeNull()
    expect((window as unknown as { injected?: boolean }).injected).toBeUndefined()
  })
})
