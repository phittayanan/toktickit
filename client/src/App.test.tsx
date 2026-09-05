import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './api'

const SEEDED_REQUESTERS = [{ id: 1, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th' }]
const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Wi-Fi' }]

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
  vi.spyOn(api, 'fetchTickets').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function selectRequester() {
  vi.spyOn(api, 'fetchRequesters').mockResolvedValue(SEEDED_REQUESTERS)
  render(<App />)
  await waitFor(() => screen.getByLabelText(/development requester/i))
  fireEvent.change(screen.getByLabelText(/development requester/i), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => screen.getByRole('heading', { name: /my tickets/i }))
}

describe('App', () => {
  // AC-02: no Requester selected yet -> the Selector is shown
  it('shows the Requester Selector before a Requester is chosen', async () => {
    vi.spyOn(api, 'fetchRequesters').mockResolvedValue(SEEDED_REQUESTERS)
    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText(/development requester/i)).toBeInTheDocument()
    })
  })

  // Shell + My Tickets wiring: selecting a Requester reveals the shell
  // (their name, a Change Requester action) wrapping the My Tickets screen.
  it('shows the app shell with the selected Requester and the My Tickets screen after selection', async () => {
    await selectRequester()

    expect(screen.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change requester/i })).toBeInTheDocument()
  })

  it('returns to the Requester Selector when Change Requester is clicked', async () => {
    await selectRequester()

    fireEvent.click(screen.getByRole('button', { name: /change requester/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/development requester/i)).toBeInTheDocument()
    })
  })

  // The nav bar's Create Ticket link navigates to Create Ticket.
  it('navigates to Create Ticket via the nav link', async () => {
    await selectRequester()
    const nav = within(screen.getByRole('navigation'))

    fireEvent.click(nav.getByRole('button', { name: /create ticket/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/^summary/i)).toBeInTheDocument()
    })
  })

  // The nav bar's My Tickets link returns from Create Ticket to My Tickets.
  it('navigates back to My Tickets via the nav link', async () => {
    await selectRequester()
    const nav = within(screen.getByRole('navigation'))
    fireEvent.click(nav.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => screen.getByLabelText(/^summary/i))

    fireEvent.click(nav.getByRole('button', { name: /my tickets/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
    })
  })
})
