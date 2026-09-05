import { test, expect } from '@playwright/test'
import {
  REQUESTER_A,
  REQUESTER_B,
  createTicketViaUI,
  selectRequesterViaUI,
  switchRequesterViaUI,
} from './support/create-ticket-flow'

// E2E-02 (docs/lab-02/tests.md, AC-03/AC-19): Requester A creates a
// Ticket; after switching to Requester B, that Ticket is absent from B's
// My Tickets, and B's own request for its detail returns 404 — same body
// as a nonexistent Ticket (ADR-0004). The SPA has no ticket-detail
// URL/route to visit directly as Requester B, so that half of the check
// goes through the same API seam the UI itself calls, with B's real
// X-Requester-Id header — still full-stack, just not through the DOM.
test('Requester A Ticket is invisible to Requester B', async ({ page, request }) => {
  const summary = `E2E-02 ownership ${Date.now()}`

  await selectRequesterViaUI(page, REQUESTER_A)
  const ticket = await createTicketViaUI(page, summary)

  await switchRequesterViaUI(page, REQUESTER_B)

  await page.getByRole('button', { name: 'My Tickets' }).click()
  await page.getByPlaceholder(/search by ticket number/i).fill(ticket.ticketNumber)
  await expect(page.getByText('No tickets match your search or filters.')).toBeVisible()

  const apiBaseURL = process.env.API_URL ?? 'http://localhost:4000'
  const response = await request.get(`${apiBaseURL}/api/tickets/${ticket.id}`, {
    headers: { 'X-Requester-Id': String(REQUESTER_B.id) },
  })
  expect(response.status()).toBe(404)
})
