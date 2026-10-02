import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MyTickets from './MyTickets'
import * as api from './api'
import type { TicketListItem, TicketListResponse } from './api'

const CATEGORIES = [{ id: 1, name: 'Hardware' }]

function ticket(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    categoryId: 1,
    requestedPriority: 'MEDIUM',
    itPriority: null,
    currentStatus: 'NEW',
    createdAt: '2026-08-23T10:15:00.000Z',
    updatedAt: '2026-08-23T10:15:00.000Z',
    ...overrides,
  }
}

function listResponse(data: TicketListItem[], overrides: Partial<TicketListResponse['meta']> = {}): TicketListResponse {
  return {
    data,
    meta: { page: 1, pageSize: 10, totalItems: data.length, totalPages: 1, ...overrides },
  }
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MyTickets', () => {
  // UI-11 (AC-19): renders owned Tickets
  it('renders the returned Tickets', async () => {
    vi.spyOn(api, 'fetchTickets').mockResolvedValue(listResponse([ticket()]))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getAllByText('TKT-2026-000001').length).toBeGreaterThan(0)
    })
  })

  // UI-11 (AC-24): the empty-account state is distinct from the no-results state
  it('shows an empty-account message when the Requester has no Tickets at all', async () => {
    vi.spyOn(api, 'fetchTickets').mockResolvedValue(listResponse([]))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/haven't submitted any tickets yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/no tickets match/i)).not.toBeInTheDocument()
  })

  // UI-12 (AC-20/AC-21): search/filter triggers a re-fetch, and no matches
  // renders the no-results state (distinct from the empty-account one)
  it('re-fetches with the search term and shows a no-results state for zero matches', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchTickets')
      .mockResolvedValueOnce(listResponse([ticket()]))
      .mockResolvedValueOnce(listResponse([]))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByPlaceholderText(/search by ticket number or summary/i), {
      target: { value: 'nonexistent' },
    })

    await waitFor(() => {
      expect(screen.getByText(/no tickets match your search or filters/i)).toBeInTheDocument()
    })
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'nonexistent' }))
  })

  // UI-13 (AC-22): clicking a sortable column header re-fetches with the new sort
  it('re-fetches with the clicked sort column', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchTickets').mockResolvedValue(listResponse([ticket()]))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText(/ticket no\./i))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'ticketNumber', sortDir: 'desc' }),
      )
    })
  })

  // UI-13 (AC-23): the Next pagination control advances to page 2
  it('re-fetches page 2 when Next is clicked', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchTickets')
      .mockResolvedValue(listResponse([ticket()], { totalItems: 15, totalPages: 2 }))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    })
  })

  // UI-13 (AC-23): docs/lab-02/ui-spec.md §8, Previous/Next + page numbers
  it('re-fetches the page whose number is clicked', async () => {
    const fetchSpy = vi
      .spyOn(api, 'fetchTickets')
      .mockResolvedValue(listResponse([ticket()], { totalItems: 25, totalPages: 3 }))

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }))
    })
  })

  // The Create Ticket shortcut navigates away from this screen.
  it('calls onCreateTicket when the Create Ticket shortcut is clicked', async () => {
    vi.spyOn(api, 'fetchTickets').mockResolvedValue(listResponse([ticket()]))
    const onCreateTicket = vi.fn()

    render(<MyTickets onCreateTicket={onCreateTicket} onOpenTicket={vi.fn()} />)
    await waitFor(() => screen.getAllByText('TKT-2026-000001'))

    fireEvent.click(screen.getByRole('button', { name: /^create ticket$/i }))
    expect(onCreateTicket).toHaveBeenCalled()
  })

  // Row click opens Ticket Detail (ui-spec.md §8: "row click opens Ticket Detail")
  it('calls onOpenTicket with the Ticket id when a row is clicked', async () => {
    vi.spyOn(api, 'fetchTickets').mockResolvedValue(listResponse([ticket({ id: 42 })]))
    const onOpenTicket = vi.fn()

    render(<MyTickets onCreateTicket={vi.fn()} onOpenTicket={onOpenTicket} />)
    await waitFor(() => screen.getAllByText('TKT-2026-000001'))

    fireEvent.click(screen.getAllByRole('button', { name: /TKT-2026-000001/i })[0])
    expect(onOpenTicket).toHaveBeenCalledWith(42)
  })
})
