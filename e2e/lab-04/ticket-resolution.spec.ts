import { test, expect, type Locator, type Page } from '@playwright/test'
import { addDoneAction, apiSessionFor, createTicketFor, type ArrangedTicket } from '../lab-03/support/api'
import { signInAs } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'

// The Resolution Gate and the Ticket status control (docs/lab-04/tests.md
// E2E-04 to E2E-06). The Done Action Taken is arranged through the API: its
// form is the Actions Taken card of issue #79.

const RESOLUTION_SUMMARY = 'Replaced the battery; the charge now holds.'

const operations = (page: Page): Locator => page.getByRole('region', { name: 'Manage this ticket' })
const statusSelect = (page: Page): Locator => operations(page).getByLabel('Current Status')
const statusBadges = (page: Page): Locator => page.getByRole('group', { name: 'Ticket status' })

async function offered(page: Page) {
  return (await statusSelect(page).locator('option').allTextContents()).slice(1)
}

async function chooseStatus(page: Page, label: string) {
  await statusSelect(page).selectOption({ label })
  await operations(page).getByRole('button', { name: 'Update Status' }).click()
}

async function saveStatus(page: Page, label: string) {
  await chooseStatus(page, label)
  await expect(operations(page).getByRole('status').filter({ hasText: `Status changed to ${label}.` })).toBeVisible()
}

async function resolveInDialog(page: Page, ticket: ArrangedTicket) {
  await chooseStatus(page, 'Resolved')
  const dialog = page.getByRole('dialog', { name: `Resolve ${ticket.ticketNumber}` })
  await dialog.getByLabel('Resolution Summary').fill(RESOLUTION_SUMMARY)
  await dialog.getByRole('button', { name: 'Mark as Resolved' }).click()
  await expect(operations(page).getByRole('status').filter({ hasText: 'Status changed to Resolved.' })).toBeVisible()
}

async function closeTicket(page: Page) {
  await chooseStatus(page, 'Closed')
  await page.getByRole('dialog', { name: 'Close ticket?' }).getByRole('button', { name: 'Close Ticket' }).click()
  await expect(statusBadges(page)).toHaveText('Closed')
}

// An In Progress Ticket of the E2E IT Staff user with no Action Taken.
async function ticketInProgress(summary: string): Promise<ArrangedTicket> {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, summary)
  const api = await apiSessionFor(E2E_USERS.IT_STAFF)
  const staff = await api.get('/api/auth/me').then((res) => res.json())
  expect((await api.put(`/api/staff/tickets/${ticket.id}/owner`, { data: { ownerId: staff.id, expectedOwnerId: null } })).ok()).toBe(true)
  expect(
    (await api.post(`/api/staff/tickets/${ticket.id}/status`, { data: { status: 'IN_PROGRESS', expectedStatus: 'OPEN' } })).ok(),
  ).toBe(true)
  await api.dispose()

  return ticket
}

// E2E-04 (AC-16, AC-17, AC-18, AC-25)
test('the status control shows Resolved as not available until the work is done, then resolves and closes', async ({ page }) => {
  const ticket = await ticketInProgress('E2E Lab 4 resolution')
  await signInAs(page, 'IT_STAFF')
  await page.goto(`/staff/tickets/${ticket.id}`)

  await expect(statusSelect(page).getByRole('option', { name: 'Resolved (not available)' })).toBeDisabled()
  await expect(operations(page).getByText('Resolved needs at least one Done action and no Planned actions. Done: 0. Planned: 0.')).toBeVisible()
  await expect(statusSelect(page)).toHaveAccessibleDescription(/Done: 0\. Planned: 0\./)
  await expect(operations(page).getByRole('link', { name: 'Go to Actions Taken' })).toBeVisible()
  expect(await offered(page)).toEqual(['Waiting for Requester', 'Resolved (not available)', 'Cancelled'])

  await addDoneAction(E2E_USERS.IT_STAFF, ticket.id)
  await page.reload()

  await expect(statusSelect(page).getByRole('option', { name: 'Resolved', exact: true })).toBeEnabled()
  await expect(operations(page).getByText(/Resolved needs/)).toHaveCount(0)

  await resolveInDialog(page, ticket)
  await expect(statusBadges(page)).toContainText('Resolved')
  await closeTicket(page)
  await expect(operations(page).getByText('This ticket is closed and can no longer be changed.')).toBeVisible()
  await expect(operations(page).getByRole('combobox')).toHaveCount(0)
})

// E2E-05 (AC-16, AC-21)
test('the Requester indicating resolved changes no status, and a direct request is refused', async ({ page }) => {
  const ticket = await ticketInProgress('E2E Lab 4 appears resolved')
  await signInAs(page, 'REQUESTER')
  await page.goto(`/tickets/${ticket.id}`)

  const appearsResolved = page.getByRole('region', { name: 'Problem Appears Resolved' })
  await appearsResolved.getByRole('button', { name: 'Problem Appears Resolved' }).click()
  await expect(appearsResolved.getByRole('button', { name: 'Withdraw' })).toBeVisible()
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible()

  const api = await apiSessionFor(E2E_USERS.IT_STAFF)
  const refused = await api.post(`/api/staff/tickets/${ticket.id}/status`, {
    data: { status: 'RESOLVED', expectedStatus: 'IN_PROGRESS', resolutionSummary: RESOLUTION_SUMMARY },
  })
  expect(refused.status()).toBe(409)
  expect((await refused.json()).code).toBe('DONE_ACTION_REQUIRED')
  const stored = await api.get(`/api/staff/tickets/${ticket.id}`).then((res) => res.json())
  expect(stored.currentStatus).toBe('IN_PROGRESS')
  await api.dispose()
})

// E2E-06 (AC-19, AC-23)
test('a Ticket walks from New through Reopened to Closed, offered only the permitted transitions', async ({ page }) => {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, 'E2E Lab 4 status walk')
  await signInAs(page, 'IT_STAFF')
  await page.goto(`/staff/tickets/${ticket.id}`)
  await expect(statusBadges(page)).toHaveText('New')
  expect(await offered(page)).toEqual(['Open', 'Cancelled'])

  await saveStatus(page, 'Open')
  await operations(page).getByRole('button', { name: 'Claim' }).click()
  await expect(operations(page).getByText(`Current owner: ${E2E_USERS.IT_STAFF.name}`)).toBeVisible()
  expect(await offered(page)).toEqual(['In Progress', 'Waiting for Requester', 'Cancelled'])

  await saveStatus(page, 'In Progress')
  expect(await offered(page)).toEqual(['Waiting for Requester', 'Resolved (not available)', 'Cancelled'])

  await saveStatus(page, 'Waiting for Requester')
  expect(await offered(page)).toEqual(['In Progress', 'Resolved (not available)', 'Cancelled'])

  await addDoneAction(E2E_USERS.IT_STAFF, ticket.id)
  await page.reload()
  await expect(statusBadges(page)).toContainText('Waiting for Requester')
  expect(await offered(page)).toEqual(['In Progress', 'Resolved', 'Cancelled'])

  await resolveInDialog(page, ticket)
  expect(await offered(page)).toEqual(['Closed', 'Reopened'])

  await saveStatus(page, 'Reopened')
  // BR-23: the earlier Done Action Taken still counts.
  expect(await offered(page)).toEqual(['In Progress', 'Waiting for Requester', 'Resolved', 'Cancelled'])

  await resolveInDialog(page, ticket)
  await closeTicket(page)
})
