import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { apiSessionFor, apiUrl, createTicketFor, startWorkOn } from '../lab-03/support/api'
import { signInAsUser } from '../lab-03/support/signIn'
import { createDisposableUser, E2E_USERS } from '../lab-03/support/users'
import { changeStatusElsewhere } from '../lab-03/support/visualData'

// E2E-07 to E2E-10 (docs/lab-04/tests.md). Each role drills from its
// Dashboard into the screen a count stands for.

const FIVE_STATUSES = 'Open Tickets'

function navigationEntries(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' }).getByRole('button')
}

// The count a metric card or link-table row shows, from its accessible name.
async function countOf(page: Page, label: string): Promise<number> {
  const link = page.getByRole('link', { name: new RegExp(`^${label}: \\d+$`) })
  const name = await link.getAttribute('aria-label')

  return Number(name?.split(': ')[1])
}

// The total the list screen itself reports (or no rows at all).
async function expectListTotal(page: Page, count: number) {
  if (count === 0) {
    await expect(page.getByText(/Showing \d+ to \d+ of/)).toHaveCount(0)
    return
  }
  await expect(page.getByText(new RegExp(`Showing \\d+ to \\d+ of ${count} tickets`)).first()).toBeVisible()
}

function dashboardLink(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Dashboard' })
}

test('E2E-07: a Requester lands on the Dashboard and drills into each card and list', async ({ page }) => {
  const requester = createDisposableUser('REQUESTER')
  const other = createDisposableUser('REQUESTER')
  const staff = createDisposableUser('IT_STAFF')
  const waiting = await createTicketFor(requester, `Dashboard waiting ${Date.now()}`)
  await startWorkOn(staff, waiting)
  await changeStatusElsewhere(waiting, 'WAITING_FOR_REQUESTER', 'IN_PROGRESS')
  const fresh = await createTicketFor(requester, `Dashboard new ${Date.now()}`)
  await createTicketFor(other, `Dashboard of someone else ${Date.now()}`)

  await signInAsUser(page, requester)

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(navigationEntries(page)).toHaveText(['Dashboard', 'My Tickets', 'Create Ticket'])
  await expect(dashboardLink(page)).toHaveAttribute('aria-current', 'page')
  const recent = page.getByRole('region', { name: 'Recently updated' })
  await expect(recent.getByRole('link')).toHaveCount(2)
  await expect(page.getByText('someone else')).toHaveCount(0)

  await page.getByRole('link', { name: `${FIVE_STATUSES}: 2` }).click()
  await expect(page).toHaveURL(/\/tickets\?currentStatus=open$/)
  await expect(page.getByLabel('Current Status')).toHaveValue('open')
  await expectListTotal(page, 2)

  await dashboardLink(page).click()
  await page.getByRole('link', { name: 'Waiting for Requester: 1' }).click()
  await expect(page).toHaveURL(/\/tickets\?currentStatus=WAITING_FOR_REQUESTER$/)
  await expect(page.getByLabel('Current Status')).toHaveValue('WAITING_FOR_REQUESTER')
  await expectListTotal(page, 1)

  await dashboardLink(page).click()
  await page.getByRole('region', { name: 'Recently updated' }).getByRole('link', { name: new RegExp(fresh.ticketNumber) }).click()
  await expect(page).toHaveURL(new RegExp(`/tickets/${fresh.id}$`))
  await expect(page.getByText(fresh.ticketNumber).first()).toBeVisible()
})

test('E2E-08: IT Staff lands on the Dashboard and drills into each metric', async ({ page }) => {
  const staff = createDisposableUser('IT_STAFF')
  const owned = await createTicketFor(E2E_USERS.REQUESTER, `Dashboard owned ${Date.now()}`)
  await startWorkOn(staff, owned)
  const api = await apiSessionFor(staff)
  for (let index = 0; index < 6; index += 1) {
    const response = await api.post(`/api/staff/tickets/${owned.id}/actions-taken`, {
      data: {
        clientRequestId: randomUUID(),
        actionAt: new Date(Date.now() + (index + 1) * 3_600_000).toISOString(),
        description: `Planned step ${index + 1}`,
        status: 'PLANNED',
        assigneeId: staff.id,
      },
    })
    expect(response.status(), 'arranging a Planned Action Taken').toBe(201)
  }
  await api.dispose()

  await signInAsUser(page, staff)

  await expect(page).toHaveURL(/\/staff\/dashboard$/)
  await expect(navigationEntries(page)).toHaveText(['Dashboard', 'Ticket Queue'])
  await expect(dashboardLink(page)).toHaveAttribute('aria-current', 'page')

  const planned = page.getByRole('region', { name: 'My Planned Actions Taken' })
  await expect(page.getByRole('link', { name: 'My Planned Actions Taken: 6' })).toBeVisible()
  await expect(planned.getByRole('link')).toHaveCount(5)
  await page.getByRole('link', { name: 'My Planned Actions Taken: 6' }).click()
  await expect(planned).toBeFocused()
  await expect(page).toHaveURL(/\/staff\/dashboard$/)
  await expect(planned.getByRole('link').first()).toHaveAttribute('href', `/staff/tickets/${owned.id}#actions-taken`)

  const ownedByMe = await countOf(page, 'Owned by me')
  expect(ownedByMe).toBe(1)
  await page.getByRole('link', { name: 'Owned by me: 1' }).click()
  await expect(page).toHaveURL(/\/staff\/queue\?owner=me$/)
  await expectListTotal(page, ownedByMe)

  await dashboardLink(page).click()
  const unassigned = await page
    .getByRole('link', { name: /^Unassigned: \d+$/ })
    .getAttribute('aria-label')
    .then((name) => Number(name?.split(': ')[1]))
  await page.getByRole('link', { name: `Unassigned: ${unassigned}` }).click()
  await expect(page).toHaveURL(/\/staff\/queue\?owner=unassigned$/)
  await expectListTotal(page, unassigned)

  for (const [label, param] of [
    ['In Progress', 'status=IN_PROGRESS'],
    ['High', 'itPriority=HIGH'],
  ]) {
    await dashboardLink(page).click()
    await expect(page.getByRole('region', { name: 'By status' })).toBeVisible()
    const count = await countOf(page, label)
    // The row is one target: the count beside the badge opens it too.
    const cell = await page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: `${label}: ${count}` }) })
      .getByRole('cell')
      .boundingBox()
    await page.mouse.click(cell!.x + cell!.width / 2, cell!.y + cell!.height / 2)
    await expect(page).toHaveURL(new RegExp(`/staff/queue\\?${param}$`))
    await expectListTotal(page, count)
  }
})

test('E2E-09: an Administrator opens each Active accounts card, and every Lab 3 entry remains', async ({ page }) => {
  await signInAsUser(page, E2E_USERS.ADMINISTRATOR)

  await expect(page).toHaveURL(/\/staff\/dashboard$/)
  await expect(navigationEntries(page)).toHaveText(['Dashboard', 'Ticket Queue', 'User Management'])
  const accounts = page.getByRole('region', { name: 'Active accounts' })

  for (const [label, role] of [
    ['Requesters', 'REQUESTER'],
    ['IT Staff', 'IT_STAFF'],
    ['Administrators', 'ADMINISTRATOR'],
  ]) {
    await expect(accounts.getByRole('link', { name: new RegExp(`^${label}: \\d+$`) })).toBeVisible()
    await accounts.getByRole('link', { name: new RegExp(`^${label}: \\d+$`) }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/users\\?role=${role}$`))
    await expect(page.getByLabel('Role', { exact: true })).toHaveValue(role)
    await dashboardLink(page).click()
  }
})

test('E2E-09: IT Staff never sees Active accounts or asks for them', async ({ page }) => {
  const adminRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/admin/')) adminRequests.push(request.url())
  })

  await signInAsUser(page, E2E_USERS.IT_STAFF)

  await expect(page.getByRole('link', { name: /^Unassigned: \d+$/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Active accounts' })).toHaveCount(0)
  expect(adminRequests).toEqual([])
})

test('E2E-10: each role is refused the other dashboard, on screen and by the API', async ({ page }) => {
  await signInAsUser(page, E2E_USERS.IT_STAFF)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  const staffCalls = await page.request.get(apiUrl('/api/requester/dashboard'))
  expect(staffCalls.status()).toBe(403)
  expect(await staffCalls.json()).not.toHaveProperty('openCount')

  await page.getByRole('button', { name: 'Go to Dashboard' }).click()
  await expect(page).toHaveURL(/\/staff\/dashboard$/)

  await page.context().clearCookies()
  await signInAsUser(page, E2E_USERS.REQUESTER)
  await page.goto('/staff/dashboard')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  const requesterCalls = await page.request.get(apiUrl('/api/staff/dashboard'))
  expect(requesterCalls.status()).toBe(403)
  expect(await requesterCalls.json()).not.toHaveProperty('unassignedCount')
  expect((await page.request.get(apiUrl('/api/admin/dashboard'))).status()).toBe(403)
})
