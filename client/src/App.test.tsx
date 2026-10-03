import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './api'
import { openPath, REQUESTER, signedInAs } from './test/session'

const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Wi-Fi' }]

beforeEach(() => {
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

// The Requester is signed in (docs/lab-03 FR-09) instead of being chosen
// from the deleted Development Requester selector.
async function signInAsRequester() {
  signedInAs(REQUESTER)
  openPath('/tickets')
  render(<App />)
  await waitFor(() => screen.getByRole('heading', { name: /my tickets/i }))
}

describe('App', () => {
  // Shell + My Tickets wiring: the shell (the signed-in Requester's name)
  // wraps the My Tickets screen.
  it('shows the app shell with the signed-in Requester and the My Tickets screen', async () => {
    await signInAsRequester()

    expect(screen.getByText('Somchai Jaidee')).toBeInTheDocument()
  })

  // The nav bar's Create Ticket link navigates to Create Ticket.
  it('navigates to Create Ticket via the nav link', async () => {
    await signInAsRequester()
    const nav = within(screen.getByRole('navigation'))

    fireEvent.click(nav.getByRole('button', { name: /create ticket/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/^summary/i)).toBeInTheDocument()
    })
  })

  // The nav bar's My Tickets link returns from Create Ticket to My Tickets.
  it('navigates back to My Tickets via the nav link', async () => {
    await signInAsRequester()
    const nav = within(screen.getByRole('navigation'))
    fireEvent.click(nav.getByRole('button', { name: /create ticket/i }))
    await waitFor(() => screen.getByLabelText(/^summary/i))

    fireEvent.click(nav.getByRole('button', { name: /my tickets/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
    })
  })
})
