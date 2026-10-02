import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { logOut, signInAsUser } from '../../lab-03/support/signIn'
import { E2E_SECOND_REQUESTER, E2E_USERS, type E2EUser } from '../../lab-03/support/users'

const ATTACHMENT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'attachment.png')

// Two Requesters the Lab 3 global setup creates (docs/lab-03/tests.md §1
// E2E), so the ownership test always has two distinct real identities.
export const REQUESTER_A: E2EUser = E2E_USERS.REQUESTER
export const REQUESTER_B: E2EUser = E2E_SECOND_REQUESTER

// Signs in through the real Login screen. Lab 3 retired the Development
// Requester Selector these flows used to drive (specification.md BR-48):
// identity now comes from a session.
export async function signInRequesterViaUI(page: Page, requester: E2EUser) {
  await signInAsUser(page, requester)
  await page.getByText(requester.name).waitFor()
}

// Logs the current Requester out and signs the other one in, which is what
// replaced Change Requester.
export async function switchRequesterViaUI(page: Page, from: E2EUser, to: E2EUser) {
  await logOut(page, from)
  await signInRequesterViaUI(page, to)
}

export interface CreatedTicket {
  id: number
  ticketNumber: string
  summary: string
}

// Drives the real Create Ticket form end-to-end (ui-spec.md §7) and
// returns both the human-facing Ticket Number and the numeric id from the
// POST /api/tickets response body (needed to hit the detail endpoint
// directly in the ownership test).
export async function createTicketViaUI(page: Page, summary: string): Promise<CreatedTicket> {
  await page.getByRole('button', { name: 'Create Ticket' }).first().click()
  // My Tickets has a Category filter of its own: wait for the form itself.
  await page.getByRole('heading', { level: 1, name: 'Create Ticket' }).waitFor()

  await page.getByLabel('Category').selectOption({ index: 1 })
  await page.getByLabel('Related System').selectOption({ index: 1 })
  await page.getByLabel('Requested Priority').selectOption({ index: 1 })
  await page.getByLabel('Summary').fill(summary)
  await page.getByLabel('Description').fill('Created by the E2E-01 full-flow test suite.')
  await page.getByLabel('Attachments').setInputFiles({
    name: 'attachment.png',
    mimeType: 'image/png',
    buffer: readFileSync(ATTACHMENT_FIXTURE),
  })

  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/api/tickets') && res.request().method() === 'POST'),
    page.getByRole('button', { name: 'Submit' }).click(),
  ])
  const body = (await response.json()) as { id: number; ticketNumber: string }

  await page.getByText('Ticket Created').waitFor()
  await page.getByText(body.ticketNumber).waitFor()
  // ADR-0003: the Attachment uploads automatically right after Ticket
  // creation — wait for it to finish before returning.
  await page.getByText('1 of 1 attachments uploaded').waitFor()

  return { id: body.id, ticketNumber: body.ticketNumber, summary }
}
