import { test, expect, type Locator, type Page } from '@playwright/test'
import { apiSessionFor, apiUrl, createTicketFor } from './support/api'
import { openTicketQueue, searchQueue } from './support/queue'
import { signInAs, signInAsUser } from './support/signIn'
import { E2E_SECOND_REQUESTER, E2E_USERS } from './support/users'

// The seed Tickets are TKT-2026-900001 to TKT-2026-900024 (specification.md
// §7.4). Nothing an E2E run creates is numbered from 900000, so this
// fragment narrows the queue to the seed data alone.
const SEED_TICKET_FRAGMENT = 'TKT-2026-9000'
const SEED_TICKET_COUNT = 24

// The Ticket Queue table (ui-spec.md §8.1), in column order.
const COLUMN = { ticketNumber: 0, summary: 1, category: 2, itPriority: 3, status: 4, owner: 5 } as const

function queueRows(page: Page): Locator {
  return page.getByRole('table').locator('tbody').getByRole('row')
}

function cells(page: Page, column: number): Locator {
  return queueRows(page).locator(`td:nth-child(${column + 1})`)
}

function caption(page: Page, from: number, to: number, total: number): Locator {
  return page.getByText(`Showing ${from} to ${to} of ${total} tickets`)
}

function operations(page: Page): Locator {
  return page.getByRole('region', { name: 'Manage this ticket' })
}

function statusBadges(page: Page): Locator {
  return page.getByRole('group', { name: 'Ticket status' })
}

// Finds a Ticket in the queue by its number and opens Staff Ticket Detail
// through the Ticket Number link.
async function openFromQueue(page: Page, ticketNumber: string) {
  await searchQueue(page, ticketNumber)
  await page.getByRole('link', { name: ticketNumber }).click()
  await expect(page.getByRole('heading', { level: 1, name: ticketNumber })).toBeVisible()
}

async function chooseStatus(page: Page, label: string) {
  await operations(page).getByLabel('Current Status').selectOption({ label })
  await operations(page).getByRole('button', { name: 'Update Status' }).click()
}

// E2E-05 (AC-20, AC-21, AC-31, AC-33, AC-35, AC-37, AC-38): one Ticket from
// creation to Closed, across a Requester and an IT Staff user, each in
// their own browser session.
test('E2E-05 a Ticket goes from creation to Closed across the Requester and IT Staff', async ({ browser }) => {
  test.slow()
  const summary = `E2E-05 staff flow ${Date.now()}`
  const requesterComment = 'The projector in room 204 still shows no signal.'
  const staffComment = 'We replaced the HDMI cable. Please try again.'
  const internalNote = 'Spare cable taken from storeroom B, asset tag 4471.'
  const resolutionSummary = 'Replaced the faulty HDMI cable and confirmed the projector displays again.'

  const requesterContext = await browser.newContext()
  const staffContext = await browser.newContext()
  const requesterPage = await requesterContext.newPage()
  const staffPage = await staffContext.newPage()

  // Every response body the Requester's browser receives, to prove the
  // Internal Note never reaches it (AC-23, AC-38).
  const requesterResponses: Promise<string>[] = []
  requesterPage.on('response', (response) => {
    if (response.url().includes('/api/')) requesterResponses.push(response.text().catch(() => ''))
  })

  // Requester: create the Ticket and post a Public Comment.
  await signInAs(requesterPage, 'REQUESTER')
  await requesterPage.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create Ticket' }).click()
  // My Tickets has a Category filter too: wait for the form itself.
  await expect(requesterPage.getByRole('heading', { level: 1, name: 'Create Ticket' })).toBeVisible()
  await requesterPage.getByLabel('Category').selectOption({ index: 1 })
  await requesterPage.getByLabel('Related System').selectOption({ index: 1 })
  await requesterPage.getByLabel('Requested Priority').selectOption({ label: 'Low' })
  await requesterPage.getByLabel('Summary').fill(summary)
  await requesterPage.getByLabel('Description').fill('Created by E2E-05 to be worked by IT Staff.')
  const [created] = await Promise.all([
    requesterPage.waitForResponse((res) => res.url().endsWith('/api/tickets') && res.request().method() === 'POST'),
    requesterPage.getByRole('button', { name: 'Submit' }).click(),
  ])
  const { ticketNumber } = (await created.json()) as { ticketNumber: string }
  await expect(requesterPage.getByRole('heading', { name: 'Ticket Created' })).toBeVisible()

  await requesterPage.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'My Tickets' }).click()
  await requesterPage.getByLabel('Search').fill(ticketNumber)
  await requesterPage.getByRole('button', { name: new RegExp(ticketNumber) }).click()
  await expect(requesterPage.getByRole('heading', { level: 1, name: ticketNumber })).toBeVisible()

  await requesterPage.getByLabel('Add a comment').fill(requesterComment)
  await requesterPage.getByRole('button', { name: 'Post Comment' }).click()
  await expect(requesterPage.getByRole('status').filter({ hasText: 'Comment posted' })).toBeVisible()
  await expect(requesterPage.getByRole('heading', { name: 'Public Comments (1)' })).toBeVisible()

  // IT Staff: find it in the queue, claim it, set the IT Priority, start work.
  const staff = await signInAs(staffPage, 'IT_STAFF')
  await openFromQueue(staffPage, ticketNumber)
  await expect(staffPage.getByText(requesterComment)).toBeVisible()
  await expect(statusBadges(staffPage)).toHaveText('New')

  await operations(staffPage).getByRole('button', { name: 'Claim' }).click()
  await expect(
    operations(staffPage).getByRole('status').filter({ hasText: 'Owner updated. Status changed to Open.' }),
  ).toBeVisible()
  await expect(statusBadges(staffPage)).toHaveText('Open')
  await expect(operations(staffPage).getByText(`Current owner: ${staff.name}`)).toBeVisible()

  await operations(staffPage).getByLabel('IT Priority').selectOption({ label: 'High' })
  await operations(staffPage).getByRole('button', { name: 'Update Priority' }).click()
  await expect(operations(staffPage).getByRole('status').filter({ hasText: 'IT Priority updated.' })).toBeVisible()
  // AC-33: the Requested Priority stays what the Requester chose.
  await expect(operations(staffPage).getByText('Requested Priority: Low')).toBeVisible()

  await chooseStatus(staffPage, 'In Progress')
  await expect(operations(staffPage).getByRole('status').filter({ hasText: 'Status changed to In Progress.' })).toBeVisible()
  await expect(statusBadges(staffPage)).toHaveText('In Progress')

  const commentsPanel = staffPage.getByRole('tabpanel', { name: /Public Comments/ })
  await commentsPanel.getByLabel('Add a comment').fill(staffComment)
  await commentsPanel.getByRole('button', { name: 'Post Public Comment' }).click()
  await expect(commentsPanel.getByRole('status').filter({ hasText: 'Comment posted' })).toBeVisible()

  await staffPage.getByRole('tab', { name: /Internal Notes/ }).click()
  const notesPanel = staffPage.getByRole('tabpanel', { name: /Internal Notes/ })
  await expect(notesPanel.getByText('Internal — never shown to the Requester.')).toBeVisible()
  await notesPanel.getByLabel('Add an internal note').fill(internalNote)
  await notesPanel.getByRole('button', { name: 'Add Internal Note' }).click()
  await expect(notesPanel.getByRole('status').filter({ hasText: 'Internal note added' })).toBeVisible()
  await expect(notesPanel.getByText(internalNote)).toBeVisible()
  await expect(staffPage.getByRole('tab', { name: 'Internal Notes (1)' })).toBeVisible()

  // Requester: sees the status, the owner, and the comment, never the note.
  await requesterPage.reload()
  await expect(requesterPage.getByText(staffComment)).toBeVisible()
  await expect(requesterPage.getByRole('heading', { name: 'Public Comments (2)' })).toBeVisible()
  await expect(requesterPage.getByText('In Progress', { exact: true })).toBeVisible()
  await expect(requesterPage.getByText(staff.name).first()).toBeVisible()
  await expect(requesterPage.getByText(internalNote)).toHaveCount(0)
  await expect(requesterPage.getByText(/internal note/i)).toHaveCount(0)

  const appearsResolved = requesterPage.getByRole('region', { name: 'Problem Appears Resolved' })
  await appearsResolved.getByRole('button', { name: 'Problem Appears Resolved' }).click()
  await expect(
    requesterPage.getByRole('status').filter({ hasText: 'IT has been told that the problem appears resolved.' }),
  ).toBeVisible()
  await expect(appearsResolved.getByRole('button', { name: 'Withdraw' })).toBeVisible()
  // AC-21: the indication is a flag, not a status change.
  await expect(requesterPage.getByText('In Progress', { exact: true })).toBeVisible()

  // IT Staff: sees the flag, resolves with a summary, then closes.
  await staffPage.reload()
  await expect(statusBadges(staffPage)).toContainText('Requester: appears resolved')

  await chooseStatus(staffPage, 'Resolved')
  const resolveDialog = staffPage.getByRole('dialog', { name: `Resolve ${ticketNumber}` })
  await resolveDialog.getByRole('button', { name: 'Mark as Resolved' }).click()
  await expect(resolveDialog.getByText('A resolution summary is required.')).toBeVisible()
  await resolveDialog.getByLabel('Resolution Summary').fill(resolutionSummary)
  await resolveDialog.getByRole('button', { name: 'Mark as Resolved' }).click()
  await expect(operations(staffPage).getByRole('status').filter({ hasText: 'Status changed to Resolved.' })).toBeVisible()
  // AC-35: resolving clears the Requester's flag.
  await expect(statusBadges(staffPage)).toContainText('Resolved')
  await expect(statusBadges(staffPage)).not.toContainText('Requester: appears resolved')
  await expect(staffPage.getByRole('region', { name: 'Resolution Summary' })).toContainText(resolutionSummary)

  await chooseStatus(staffPage, 'Closed')
  const closeDialog = staffPage.getByRole('dialog', { name: 'Close ticket?' })
  await expect(closeDialog).toContainText(`Close ${ticketNumber}? A closed ticket cannot be reopened or changed.`)
  await closeDialog.getByRole('button', { name: 'Close Ticket' }).click()
  await expect(statusBadges(staffPage)).toHaveText('Closed')

  // AC-37: a closed Ticket is read-only for staff.
  await expect(operations(staffPage).getByText('This ticket is closed and can no longer be changed.')).toBeVisible()
  await expect(operations(staffPage).getByRole('button')).toHaveCount(0)
  await expect(operations(staffPage).getByRole('combobox')).toHaveCount(0)
  await staffPage.getByRole('tab', { name: /Public Comments/ }).click()
  await expect(staffPage.getByRole('button', { name: 'Post Public Comment' })).toHaveCount(0)
  await staffPage.getByRole('tab', { name: /Internal Notes/ }).click()
  await expect(staffPage.getByRole('button', { name: 'Add Internal Note' })).toHaveCount(0)
  await expect(staffPage.getByRole('tabpanel', { name: /Internal Notes/ }).getByText(internalNote)).toBeVisible()

  // Requester: reads the Resolution Summary; the closed Ticket is read-only.
  await requesterPage.reload()
  await expect(requesterPage.getByText('Closed', { exact: true })).toBeVisible()
  await expect(requesterPage.getByText(resolutionSummary)).toBeVisible()
  await expect(
    requesterPage.getByText('This ticket is closed. Create a new ticket if you need more help.'),
  ).toBeVisible()
  await expect(requesterPage.getByRole('button', { name: 'Post Comment' })).toHaveCount(0)
  await expect(requesterPage.getByRole('region', { name: 'Problem Appears Resolved' })).toHaveCount(0)
  await expect(requesterPage.getByLabel('Add Attachment')).toHaveCount(0)
  await expect(requesterPage.getByText(internalNote)).toHaveCount(0)

  const bodies = await Promise.all(requesterResponses)
  expect(bodies.some((body) => body.includes(internalNote)), 'a Requester response held the Internal Note').toBe(false)

  await requesterContext.close()
  await staffContext.close()
})

// E2E-06 (AC-25 to AC-28): the queue over the seed Tickets.
test.describe('E2E-06 Ticket Queue over seed data', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'IT_STAFF')
    await page.getByLabel('Status').selectOption({ label: 'All statuses' })
    await searchQueue(page, SEED_TICKET_FRAGMENT)
    await expect(caption(page, 1, 10, SEED_TICKET_COUNT)).toBeVisible()
  })

  test('search by Ticket Number, Summary, and Requester name', async ({ page }) => {
    await searchQueue(page, 'tkt-2026-900001')
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(['TKT-2026-900001'])

    await searchQueue(page, 'LIBRARY READING ROOM')
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(['TKT-2026-900001'])
    await expect(cells(page, COLUMN.summary)).toContainText(['Wi-Fi drops in the library reading room'])

    await searchQueue(page, 'kittipong rattanakosin')
    await expect(queueRows(page).first()).toBeVisible()
    for (const summaryCell of await cells(page, COLUMN.summary).all()) {
      await expect(summaryCell).toContainText('Kittipong Rattanakosin')
    }
  })

  test('each filter lists only the Tickets that match it', async ({ page }) => {
    const expectEveryCell = async (column: number, text: string | RegExp) => {
      await expect(queueRows(page).first()).toBeVisible()
      for (const cell of await cells(page, column).all()) await expect(cell).toHaveText(text)
    }

    await page.getByLabel('Status').selectOption({ label: 'Waiting for Requester' })
    await expect(page).toHaveURL(/status=WAITING_FOR_REQUESTER/)
    await expectEveryCell(COLUMN.status, 'Waiting for Requester')

    await page.getByLabel('Status').selectOption({ label: 'All statuses' })
    await page.getByLabel('Owner').selectOption({ label: 'Unassigned' })
    await expect(page).toHaveURL(/owner=unassigned/)
    await expectEveryCell(COLUMN.owner, 'Unassigned')

    await page.getByLabel('Owner').selectOption({ label: 'Wichai Phromma' })
    await expect(page).toHaveURL(/owner=\d+/)
    await expectEveryCell(COLUMN.owner, 'Wichai Phromma')

    await page.getByLabel('Owner').selectOption({ label: 'Any owner' })
    await page.getByLabel('IT Priority').selectOption({ label: 'High' })
    await expect(page).toHaveURL(/itPriority=HIGH/)
    await expectEveryCell(COLUMN.itPriority, 'High')

    await page.getByLabel('IT Priority').selectOption({ label: 'Any' })
    await page.getByLabel('Category').selectOption({ label: 'Network' })
    await expect(page).toHaveURL(/categoryId=\d+/)
    await expectEveryCell(COLUMN.category, 'Network')

    await page.getByLabel('Category').selectOption({ label: 'Any' })
    // The checkbox shows what the URL holds, so it turns a moment after
    // the click rather than with it.
    await page.getByLabel('Requester says resolved').click()
    await expect(page.getByLabel('Requester says resolved')).toBeChecked()
    await expect(page).toHaveURL(/appearsResolved=true/)
    await expectEveryCell(COLUMN.summary, /Requester: appears resolved/)

    // Two filters at once: every row matches both.
    await page.getByLabel('Status').selectOption({ label: 'In Progress' })
    await expect(page).toHaveURL(/status=IN_PROGRESS/)
    await expectEveryCell(COLUMN.status, 'In Progress')
    await expectEveryCell(COLUMN.summary, /Requester: appears resolved/)

    await page.getByRole('button', { name: 'Clear Filters' }).click()
    await expect(page.getByLabel('Search')).toHaveValue('')
    await expect(page.getByLabel('Status')).toHaveValue('unfinished')
    await expect(page.getByLabel('Requester says resolved')).not.toBeChecked()
  })

  test('sort holds across pages, and Back from Ticket Detail restores the view', async ({ page }) => {
    const seedNumber = (position: number) => `TKT-2026-9000${String(position).padStart(2, '0')}`
    const seedNumbers = (from: number, to: number) =>
      Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => seedNumber(from < to ? from + index : from - index))

    await page.getByLabel('Sort by').selectOption({ label: 'Ticket No.' })
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(24, 15))

    await page.getByRole('button', { name: 'Descending' }).click()
    await expect(page.getByRole('button', { name: 'Ascending' })).toBeVisible()
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(1, 10))

    const pagination = page.getByRole('navigation', { name: 'Ticket list pagination' })
    await pagination.getByRole('button', { name: 'Next' }).click()
    await expect(caption(page, 11, 20, SEED_TICKET_COUNT)).toBeVisible()
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(11, 20))

    await pagination.getByRole('button', { name: 'Next' }).click()
    await expect(caption(page, 21, 24, SEED_TICKET_COUNT)).toBeVisible()
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(21, 24))

    await pagination.getByRole('button', { name: 'Previous' }).click()
    await expect(caption(page, 11, 20, SEED_TICKET_COUNT)).toBeVisible()

    // Open a Ticket from page 2, then come back both ways.
    await page.getByRole('link', { name: seedNumber(12) }).click()
    await expect(page.getByRole('heading', { level: 1, name: seedNumber(12) })).toBeVisible()

    await page.goBack()
    await expect(caption(page, 11, 20, SEED_TICKET_COUNT)).toBeVisible()
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(11, 20))
    await expect(page.getByLabel('Search')).toHaveValue(SEED_TICKET_FRAGMENT)
    await expect(page.getByLabel('Status')).toHaveValue('all')
    await expect(page.getByLabel('Sort by')).toHaveValue('ticketNumber')

    await page.getByRole('link', { name: seedNumber(12) }).click()
    await page.getByRole('button', { name: 'Back to Queue' }).click()
    await expect(caption(page, 11, 20, SEED_TICKET_COUNT)).toBeVisible()
    await expect(cells(page, COLUMN.ticketNumber)).toHaveText(seedNumbers(11, 20))
    await expect(page.getByLabel('Search')).toHaveValue(SEED_TICKET_FRAGMENT)
  })
})

// E2E-07 (AC-04, AC-15, AC-19): what a Requester gets by asking directly.
test('E2E-07 a Requester is refused staff, note, and admin endpoints and another Requester’s Ticket', async ({
  page,
}) => {
  const own = await createTicketFor(E2E_USERS.REQUESTER, `E2E-07 own ticket ${Date.now()}`)
  const other = await createTicketFor(E2E_SECOND_REQUESTER, `E2E-07 other requester ticket ${Date.now()}`)
  const nonexistentId = 2_000_000_000

  await signInAs(page, 'REQUESTER')

  const forbidden = { error: 'You do not have permission to do this.', code: 'FORBIDDEN' }
  const directRequests: { method: 'get' | 'post' | 'put' | 'patch'; path: string; data?: object }[] = [
    { method: 'get', path: '/api/staff/tickets' },
    { method: 'get', path: `/api/staff/tickets/${own.id}` },
    { method: 'get', path: '/api/staff/eligible-owners' },
    { method: 'put', path: `/api/staff/tickets/${own.id}/owner`, data: { ownerId: null, expectedOwnerId: null } },
    { method: 'put', path: `/api/staff/tickets/${own.id}/it-priority`, data: { itPriority: 'HIGH' } },
    { method: 'post', path: `/api/staff/tickets/${own.id}/status`, data: { status: 'CANCELLED', expectedStatus: 'NEW' } },
    // AC-04: Internal Notes are refused the same whether the Ticket is
    // theirs, another Requester's, or does not exist.
    ...[own.id, other.id, nonexistentId].flatMap((id) => [
      { method: 'get' as const, path: `/api/staff/tickets/${id}/notes` },
      { method: 'post' as const, path: `/api/staff/tickets/${id}/notes`, data: { body: 'A note from a Requester.' } },
    ]),
    { method: 'get', path: '/api/admin/users' },
    {
      method: 'post',
      path: '/api/admin/users',
      data: { name: 'E2E Refused', email: `e2e.refused.${Date.now()}@kmutt.ac.th`, role: 'ADMINISTRATOR' },
    },
    { method: 'patch', path: '/api/admin/users/1', data: { role: 'ADMINISTRATOR' } },
    { method: 'post', path: '/api/admin/users/1/initial-password' },
  ]

  for (const { method, path, data } of directRequests) {
    const response = await page.request[method](apiUrl(path), { data })
    expect(response.status(), `${method.toUpperCase()} ${path}`).toBe(403)
    expect(await response.json(), `${method.toUpperCase()} ${path}`).toEqual(forbidden)
  }

  // The refused status request left the Ticket as it was (AC-22).
  const unchanged = await page.request.get(apiUrl(`/api/tickets/${own.id}`))
  expect((await unchanged.json()).currentStatus).toBe('NEW')

  // AC-19: another Requester's Ticket path is the Not Found page, exactly
  // as for a Ticket that does not exist.
  for (const id of [other.id, nonexistentId]) {
    await page.goto(`/tickets/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeVisible()
    await expect(page.getByText(other.summary)).toHaveCount(0)
  }
  const [notOwned, missing] = await Promise.all(
    [other.id, nonexistentId].map((id) => page.request.get(apiUrl(`/api/tickets/${id}`))),
  )
  expect(notOwned.status()).toBe(404)
  expect(await notOwned.json()).toEqual(await missing.json())
})

// E2E-08 (AC-16): an Administrator works a Ticket exactly as IT Staff do.
test('E2E-08 an Administrator claims a Ticket and changes its status', async ({ page }) => {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-08 administrator works a ticket ${Date.now()}`)

  const administrator = await signInAsUser(page, E2E_USERS.ADMINISTRATOR)
  await openTicketQueue(page)
  await openFromQueue(page, ticket.ticketNumber)

  await operations(page).getByRole('button', { name: 'Claim' }).click()
  await expect(
    operations(page).getByRole('status').filter({ hasText: 'Owner updated. Status changed to Open.' }),
  ).toBeVisible()
  await expect(operations(page).getByText(`Current owner: ${administrator.name}`)).toBeVisible()

  await chooseStatus(page, 'In Progress')
  await expect(operations(page).getByRole('status').filter({ hasText: 'Status changed to In Progress.' })).toBeVisible()
  await expect(statusBadges(page)).toHaveText('In Progress')

  // The change is stored, not only shown: the Requester's own view of the
  // Ticket names the Administrator as owner.
  const requesterApi = await apiSessionFor(E2E_USERS.REQUESTER)
  const stored = await (await requesterApi.get(`/api/tickets/${ticket.id}`)).json()
  await requesterApi.dispose()
  expect(stored.currentStatus).toBe('IN_PROGRESS')
  expect(stored.ownerName).toBe(administrator.name)
})
