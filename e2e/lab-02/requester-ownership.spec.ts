import { test, expect } from '@playwright/test'
import {
  REQUESTER_A,
  REQUESTER_B,
  createTicketViaUI,
  signInRequesterViaUI,
  switchRequesterViaUI,
} from './support/create-ticket-flow'

// E2E-02 (docs/lab-02/tests.md, AC-03/AC-19; docs/lab-03/tests.md REG-09):
// Requester A creates a Ticket; after Requester B signs in instead, that
// Ticket is absent from B's My Tickets, and B's own request for its detail
// returns 404 — same body as a nonexistent Ticket (ADR-0004). That half of
// the check goes through the same API seam the UI itself calls, with B's
// real session — still full-stack, just not through the DOM.
test('Requester A Ticket is invisible to Requester B', async ({ page }) => {
  const summary = `E2E-02 ownership ${Date.now()}`

  await signInRequesterViaUI(page, REQUESTER_A)
  const ticket = await createTicketViaUI(page, summary)

  await switchRequesterViaUI(page, REQUESTER_A, REQUESTER_B)

  await page.getByRole('button', { name: 'My Tickets' }).click()
  await page.getByPlaceholder(/search by ticket number/i).fill(ticket.ticketNumber)
  await expect(page.getByText('No tickets match your search or filters.')).toBeVisible()

  const apiBaseURL = process.env.API_URL ?? 'http://localhost:4000'
  // page.request carries the signed-in Requester B's session cookie.
  const response = await page.request.get(`${apiBaseURL}/api/tickets/${ticket.id}`)
  expect(response.status()).toBe(404)
})
