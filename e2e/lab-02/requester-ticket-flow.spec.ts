import { test, expect } from '@playwright/test'
import { REQUESTER_A, createTicketViaUI, signInRequesterViaUI } from './support/create-ticket-flow'

// E2E-01 (docs/lab-02/tests.md, AC-01/AC-19; docs/lab-03/tests.md REG-09):
// sign in as a Requester, create a real Ticket through the UI, and confirm
// the same Ticket (matching Ticket Number and Summary) appears in My
// Tickets.
test('create a Ticket end-to-end and find it in My Tickets', async ({ page }) => {
  const summary = `E2E-01 full flow ${Date.now()}`

  await signInRequesterViaUI(page, REQUESTER_A)
  const ticket = await createTicketViaUI(page, summary)

  await page.getByRole('button', { name: 'My Tickets' }).click()
  await page.getByPlaceholder(/search by ticket number/i).fill(ticket.ticketNumber)

  await expect(page.getByText(ticket.ticketNumber).locator('visible=true').first()).toBeVisible()
  await expect(page.getByText(summary).locator('visible=true').first()).toBeVisible()
})
