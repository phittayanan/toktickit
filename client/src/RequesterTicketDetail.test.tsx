import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RequesterTicketDetail from './RequesterTicketDetail'
import { RequesterProvider } from './RequesterContext'
import { setRequester } from './requesterStore'
import * as api from './api'
import type { TicketDetail } from './api'

function renderDetail(ticketId: number, onBack: () => void = vi.fn()) {
  return render(
    <RequesterProvider>
      <RequesterTicketDetail ticketId={ticketId} onBack={onBack} />
    </RequesterProvider>,
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
  window.localStorage.clear()
  setRequester({ id: 7, name: 'Somchai Jaidee', email: 'a@b.com' })
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
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
