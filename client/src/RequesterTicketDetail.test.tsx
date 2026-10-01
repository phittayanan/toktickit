import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
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
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

  it('calls onBack when Back to My Tickets is clicked', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue(TICKET)
    const onBack = vi.fn()

    renderDetail(42, onBack)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    fireEvent.click(screen.getByRole('button', { name: /back to my tickets/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('does not render any status-change, comments, or notes UI', async () => {
    vi.spyOn(api, 'fetchTicketById').mockResolvedValue(TICKET)

    renderDetail(42)
    await waitFor(() => screen.getAllByText('TKT-2026-000123'))

    expect(screen.queryByText(/public comment/i)).not.toBeInTheDocument()
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
