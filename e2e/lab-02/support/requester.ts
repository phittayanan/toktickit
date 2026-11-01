import type { Page } from '@playwright/test'
import { attachFileTo, createTicketFor, type ArrangedTicket } from '../../lab-03/support/api'
import { signInAs } from '../../lab-03/support/signIn'
import { E2E_USERS } from '../../lab-03/support/users'

// Signs in as the Requester the Lab 3 global setup creates and opens My
// Tickets, where the visual specs start. Lab 3 retired the Development Requester
// Selector and its localStorage entry (docs/lab-03/specification.md BR-48).
export async function signInAsRequester(page: Page) {
  await signInAs(page, 'REQUESTER')
  await page.goto('/tickets')
}

// A Ticket of that Requester with one active and one removed Attachment,
// so a visual spec has its own data instead of what another run left.
export async function arrangeTicketWithAttachments(): Promise<ArrangedTicket> {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `Lab 2 visual QA ${Date.now()}`)
  await attachFileTo(E2E_USERS.REQUESTER, ticket, 'screenshot.png')
  await attachFileTo(E2E_USERS.REQUESTER, ticket, 'wrong-file.png', 'Uploaded the wrong file.')

  return ticket
}

export const BREAKPOINTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 900 },
  mobile: { width: 390, height: 844 },
} as const
