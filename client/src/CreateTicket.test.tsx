import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateTicket from './CreateTicket'
import * as api from './api'

const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Wi-Fi' }]

const VALID_TICKET = {
  id: 42,
  ticketNumber: 'TKT-2026-000123',
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
  requestedPriority: 'MEDIUM' as const,
  itPriority: null,
  currentStatus: 'NEW',
  createdAt: '2026-08-23T10:15:00.000Z',
  updatedAt: '2026-08-23T10:15:00.000Z',
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderForm() {
  render(<CreateTicket />)
  await waitFor(() => screen.getByLabelText(/^summary/i))
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText(/related system/i), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText(/requested priority/i), { target: { value: 'MEDIUM' } })
  fireEvent.change(screen.getByLabelText(/^summary/i), {
    target: { value: 'Laptop battery drains quickly' },
  })
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: 'My laptop battery is draining much faster than usual over the past week.' },
  })
}

describe('CreateTicket', () => {
  // UI-06 (AC-09): client-side validation blocks submission
  it('shows a field-level message for a missing Summary and does not call the API', async () => {
    const createSpy = vi.spyOn(api, 'createTicket')
    await renderForm()

    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/related system/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/requested priority/i), { target: { value: 'MEDIUM' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/summary is required/i)).toBeInTheDocument()
    })
    expect(createSpy).not.toHaveBeenCalled()
  })

  // UI-07 (AC-11): double-click on Submit only fires one create call
  it('fires only one create call when Submit is double-clicked', async () => {
    let resolveCreate!: (ticket: typeof VALID_TICKET) => void
    vi.spyOn(api, 'createTicket').mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    await renderForm()
    await fillValidForm()

    const submitButton = screen.getByRole('button', { name: /submit/i })
    fireEvent.click(submitButton)
    fireEvent.click(submitButton)

    expect(api.createTicket).toHaveBeenCalledTimes(1)
    expect(submitButton).toBeDisabled()

    resolveCreate(VALID_TICKET)
    await waitFor(() => screen.getByText(VALID_TICKET.ticketNumber))
  })

  // UI-08 (AC-12): submission failure shows a failure state and retains entered data
  it('shows a failure message and keeps entered field values when the API call fails', async () => {
    vi.spyOn(api, 'createTicket').mockRejectedValue(new Error('Unable to create ticket'))
    await renderForm()
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/unable to create ticket/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/^summary/i)).toHaveValue('Laptop battery drains quickly')
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'My laptop battery is draining much faster than usual over the past week.',
    )
  })

  // UI-09 (AC-01): success renders the Ticket Number in a confirmation panel
  it('renders the Ticket Number in a confirmation panel on success', async () => {
    vi.spyOn(api, 'createTicket').mockResolvedValue(VALID_TICKET)
    await renderForm()
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(VALID_TICKET.ticketNumber)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create another/i })).toBeInTheDocument()
  })
})
