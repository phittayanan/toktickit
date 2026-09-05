import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

const ATTACHMENT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'attachment.png')

export interface StoredRequester {
  id: number
  name: string
  email: string
}

// Two active seed Requesters (server/prisma/seed) used across the E2E
// suite so #24's ownership test always has two distinct real identities.
export const REQUESTER_A: StoredRequester = { id: 1, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th' }
export const REQUESTER_B: StoredRequester = { id: 2, name: 'Nalinee Suksawat', email: 'nalinee.suksawat@kmutt.ac.th' }

// Drives the real Development Requester Selector (ADR-0001) — unlike the
// visual specs, the E2E flows exercise this screen itself rather than
// seeding localStorage directly, per AC-01's "select Requester" step.
export async function selectRequesterViaUI(page: Page, requester: StoredRequester) {
  await page.goto('/')
  await page.getByLabel('Development Requester').selectOption(String(requester.id))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText(requester.name).waitFor()
}

export async function switchRequesterViaUI(page: Page, requester: StoredRequester) {
  await page.getByRole('button', { name: 'Change Requester' }).click()
  await page.getByLabel('Development Requester').waitFor()
  await selectRequesterViaUIWithoutNavigate(page, requester)
}

async function selectRequesterViaUIWithoutNavigate(page: Page, requester: StoredRequester) {
  await page.getByLabel('Development Requester').selectOption(String(requester.id))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText(requester.name).waitFor()
}

export interface CreatedTicket {
  id: number
  ticketNumber: string
  summary: string
}

// Drives the real Create Ticket form end-to-end (ui-spec.md §7) and
// returns both the human-facing Ticket Number and the numeric id from the
// POST /api/tickets response body (needed to hit the detail endpoint
// directly in the ownership test — the SPA has no ticket-detail URL/route
// to navigate to as a different Requester).
export async function createTicketViaUI(page: Page, summary: string): Promise<CreatedTicket> {
  await page.getByRole('button', { name: 'Create Ticket' }).first().click()
  await page.getByLabel('Category').waitFor()

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
