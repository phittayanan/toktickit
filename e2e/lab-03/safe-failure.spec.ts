import { test, expect, type Page, type Route } from '@playwright/test'
import { API_URL, createTicketFor } from './support/api'
import { signInAs } from './support/signIn'
import { E2E_USERS } from './support/users'

// E2E-14 (docs/lab-03/tests.md; AC-52): the Ticket Queue, Staff Ticket
// Detail, and User Management with the API forced to fail, once by an
// unexpected server failure and once by a lost connection. Each shows the
// safe message, keeps what was entered, and exposes no internal detail.
const SAFE_FAILURE = 'Something went wrong. Please try again.'

// What a careless server could put in a 500. Only the `error` string may
// reach the screen (ui-spec.md §2.3).
const SERVER_FAILURE_BODY = {
  error: SAFE_FAILURE,
  code: 'INTERNAL_ERROR',
  stack: 'Error: connect ECONNREFUSED 10.0.0.5:5432\n    at /srv/toktickit/server/src/app.ts:61:9',
  query: 'SELECT "passwordHash" FROM "User"',
}
const INTERNAL_DETAILS = [
  'INTERNAL_ERROR',
  'ECONNREFUSED',
  '/srv/toktickit',
  'SELECT',
  'passwordHash',
  'Failed to fetch',
  'net::ERR',
  'TypeError',
]

const FAILURES = ['an unexpected server failure', 'a lost connection'] as const
type Failure = (typeof FAILURES)[number]

// Makes every API request to `path` with `method` fail until the returned
// function is called. The preflight is let through, so that the browser
// sends the real request and gets the failure as its answer.
async function failApi(page: Page, failure: Failure, method: string, path: RegExp): Promise<() => Promise<void>> {
  const matches = (url: URL) => url.href.startsWith(`${API_URL}/api/`) && path.test(url.pathname)
  const handler = async (route: Route) => {
    const request = route.request()
    if (request.method() !== method) return route.fallback()
    if (failure === 'a lost connection') return route.abort('connectionrefused')

    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': (await request.headerValue('origin')) ?? '*',
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify(SERVER_FAILURE_BODY),
    })
  }
  await page.route(matches, handler)

  return () => page.unroute(matches, handler)
}

async function expectNoInternalDetail(page: Page) {
  const shown = await page.locator('body').innerText()
  for (const detail of INTERNAL_DETAILS) expect(shown, `the page shows "${detail}"`).not.toContain(detail)
}

for (const failure of FAILURES) {
  test.describe(`E2E-14 safe failure on ${failure}`, () => {
    test('Ticket Queue keeps the search and filters and offers Retry', async ({ page }) => {
      await signInAs(page, 'IT_STAFF')
      await expect(page.getByText(/Showing \d+ to \d+ of \d+ tickets/)).toBeVisible()

      const restore = await failApi(page, failure, 'GET', /^\/api\/staff\/tickets$/)
      await page.getByLabel('Status').selectOption({ label: 'All statuses' })
      await page.getByLabel('Search').fill('TKT-2026-900001')
      // The search is applied 300ms after typing stops (ui-spec.md §8.2).
      await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('TKT-2026-900001')

      const alert = page.getByRole('alert').filter({ hasText: SAFE_FAILURE })
      await expect(alert).toBeVisible()
      await expect(page.getByLabel('Search')).toHaveValue('TKT-2026-900001')
      await expect(page.getByLabel('Status')).toHaveValue('all')
      await expect(page.getByRole('table')).toHaveCount(0)
      await expectNoInternalDetail(page)

      await restore()
      await alert.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByRole('link', { name: 'TKT-2026-900001' })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByLabel('Search')).toHaveValue('TKT-2026-900001')
    })

    test('Staff Ticket Detail keeps the chosen and typed values', async ({ page }) => {
      const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-14 safe failure ${Date.now()}`)
      const comment = 'A public comment typed before the failure.'
      const note = 'An internal note typed before the failure.'
      await signInAs(page, 'IT_STAFF')

      // The Ticket itself fails to load, then loads on Retry.
      const restoreLoad = await failApi(page, failure, 'GET', /^\/api\/staff\/tickets\/\d+$/)
      await page.goto(`/staff/tickets/${ticket.id}`)
      const loadAlert = page.getByRole('alert').filter({ hasText: SAFE_FAILURE })
      await expect(loadAlert).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0)
      await expectNoInternalDetail(page)

      await restoreLoad()
      await loadAlert.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()

      // An operational control fails: the selection stays.
      const operations = page.getByRole('region', { name: 'Manage this ticket' })
      const restorePriority = await failApi(page, failure, 'PUT', /^\/api\/staff\/tickets\/\d+\/it-priority$/)
      await operations.getByLabel('IT Priority').selectOption({ label: 'High' })
      await operations.getByRole('button', { name: 'Update Priority' }).click()
      await expect(operations.getByRole('alert').filter({ hasText: SAFE_FAILURE })).toBeVisible()
      await expect(operations.getByLabel('IT Priority')).toHaveValue('HIGH')
      await restorePriority()

      // A Public Comment fails to post: the typed text stays.
      const commentsPanel = page.getByRole('tabpanel', { name: /Public Comments/ })
      const restoreComment = await failApi(page, failure, 'POST', /^\/api\/tickets\/\d+\/comments$/)
      await commentsPanel.getByLabel('Add a comment').fill(comment)
      await commentsPanel.getByRole('button', { name: 'Post Public Comment' }).click()
      await expect(commentsPanel.getByRole('alert').filter({ hasText: SAFE_FAILURE })).toBeVisible()
      await expect(commentsPanel.getByLabel('Add a comment')).toHaveValue(comment)
      await restoreComment()

      // An Internal Note fails to save: the typed text stays, and so does
      // the comment typed in the other tab.
      await page.getByRole('tab', { name: /Internal Notes/ }).click()
      const notesPanel = page.getByRole('tabpanel', { name: /Internal Notes/ })
      const restoreNote = await failApi(page, failure, 'POST', /^\/api\/staff\/tickets\/\d+\/notes$/)
      await notesPanel.getByLabel('Add an internal note').fill(note)
      await notesPanel.getByRole('button', { name: 'Add Internal Note' }).click()
      await expect(notesPanel.getByRole('alert').filter({ hasText: SAFE_FAILURE })).toBeVisible()
      await expect(notesPanel.getByLabel('Add an internal note')).toHaveValue(note)
      await expectNoInternalDetail(page)
      await restoreNote()

      // Nothing was saved by the failed attempts, and the same text goes
      // through once the API answers again.
      await notesPanel.getByRole('button', { name: 'Add Internal Note' }).click()
      await expect(notesPanel.getByRole('status').filter({ hasText: 'Internal note added' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Internal Notes (1)' })).toBeVisible()
      await page.getByRole('tab', { name: /Public Comments/ }).click()
      await expect(commentsPanel.getByLabel('Add a comment')).toHaveValue(comment)
      await expect(page.getByRole('tab', { name: 'Public Comments (0)' })).toBeVisible()
    })

    test('User Management keeps the entered user and offers Retry', async ({ page }) => {
      const tag = Date.now()
      const entered = { name: `E2E Never Saved ${tag}`, email: `e2e.never-saved.${tag}@kmutt.ac.th` }
      await signInAs(page, 'ADMINISTRATOR')
      await expect(page.getByRole('table')).toBeVisible()

      // The list fails to load, then loads on Retry with the search kept.
      const restoreList = await failApi(page, failure, 'GET', /^\/api\/admin\/users$/)
      await page.getByLabel('Search users').fill(E2E_USERS.ADMINISTRATOR.email)
      await expect(page.getByRole('alert').filter({ hasText: SAFE_FAILURE })).toBeVisible()
      await expect(page.getByLabel('Search users')).toHaveValue(E2E_USERS.ADMINISTRATOR.email)
      await expect(page.getByRole('table')).toHaveCount(0)
      await expectNoInternalDetail(page)

      await restoreList()
      await page.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByRole('table')).toContainText(E2E_USERS.ADMINISTRATOR.email)
      await expect(page.getByRole('alert')).toHaveCount(0)

      // Saving a new user fails: the panel keeps every field.
      const restoreCreate = await failApi(page, failure, 'POST', /^\/api\/admin\/users$/)
      await page.getByRole('button', { name: 'Create User' }).click()
      const panel = page.getByRole('region', { name: 'Create New User' })
      await panel.getByLabel('Full Name').fill(entered.name)
      await panel.getByLabel('Email Address').fill(entered.email)
      await panel.getByLabel('Role').selectOption({ label: 'IT Staff' })
      await panel.getByRole('button', { name: 'Save User' }).click()

      await expect(panel.getByRole('alert').filter({ hasText: SAFE_FAILURE })).toBeVisible()
      await expect(panel.getByLabel('Full Name')).toHaveValue(entered.name)
      await expect(panel.getByLabel('Email Address')).toHaveValue(entered.email)
      await expect(panel.getByLabel('Role')).toHaveValue('IT_STAFF')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expectNoInternalDetail(page)
      await restoreCreate()

      // Nothing was created by the failed save.
      await panel.getByRole('button', { name: 'Cancel' }).click()
      await page.getByLabel('Search users').fill(entered.email)
      await expect(page.getByText('No users match your search or filter.')).toBeVisible()
    })
  })
}
