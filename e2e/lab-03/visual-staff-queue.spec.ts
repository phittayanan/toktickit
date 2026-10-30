import { expect, test, type Page } from '@playwright/test'
import { signInAsUser } from './support/signIn'
import { E2E_USERS } from './support/users'
import { BREAKPOINTS, takeScreenshot } from './support/screenshots'
import { TOKENS, createWorkedTicket, holdRequests, openUserMenu, tabTo } from './support/visualData'

// VIS-03 (docs/lab-03/tests.md): the Ticket Queue at desktop, tablet, and
// mobile, plus no-results and the other states the ui-spec.md §13
// checklist is judged by: every status and priority badge, the open menu,
// open filters, keyboard focus, loading, failure, and forbidden.
const QUEUE_REQUEST = '**/api/staff/tickets?*'
const TICKET_LINK = /TKT-\d{4}-\d{6}/

test.describe('visual: Ticket Queue', () => {
  test.describe.configure({ mode: 'default' })

  // The queue shows the seed Tickets; this adds one with the flag badge and
  // a long Summary.
  test.beforeAll(async () => {
    await createWorkedTicket()
  })

  function firstTicketLink(page: Page) {
    return page.getByRole('link', { name: TICKET_LINK }).locator('visible=true').first()
  }

  async function openQueue(page: Page) {
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto('/staff/queue')
    await expect(page.getByRole('heading', { name: 'Ticket Queue' })).toBeVisible()
    await expect(firstTicketLink(page)).toBeVisible()
  }

  async function openFilters(page: Page) {
    const toggle = page.getByRole('button', { name: /^Filters/ })
    if (await toggle.isVisible()) await toggle.click()
    await expect(page.getByLabel('Status', { exact: true })).toBeVisible()
  }

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      // Table text is the Text token, not Bootstrap's black.
      await expect(page.locator('.tk-queue__table td').first()).toHaveCSS('color', TOKENS.text)
      // The placeholder is cut short with an ellipsis, so it is also the
      // tooltip (ui-spec.md §11).
      const search = page.getByLabel('Search', { exact: true })
      await expect(search).toHaveAttribute('title', (await search.getAttribute('placeholder'))!)
      await takeScreenshot(page, 'staff-queue', name)
    })

    // The seed has Tickets in every status and priority (specification.md
    // §7.4); the newest of them fill the first page of the whole queue.
    test(`every status at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      await page.getByLabel('Tickets per page').selectOption({ label: '25 / page' })
      await openFilters(page)
      await page.getByLabel('Status', { exact: true }).selectOption({ label: 'All statuses' })
      await page.getByLabel('Sort by').selectOption({ label: 'Ticket No.' })
      const statuses = [
        'Cancelled',
        'Closed',
        'Reopened',
        'Resolved',
        'Waiting for Requester',
        'In Progress',
        'Open',
        'New',
      ]
      const priorities = ['Low', 'Medium', 'High']
      for (const label of [...statuses, ...priorities]) {
        const badge = page.locator('.badge').filter({ hasText: new RegExp(`^(✓ )?${label}$`) })
        await expect(badge.locator('visible=true').first()).toBeVisible()
      }
      const flag = page.locator('.badge').filter({ hasText: 'Requester: appears resolved' })
      await expect(flag.locator('visible=true').first()).toBeVisible()
      await takeScreenshot(page, 'staff-queue', `${name}-all-statuses`)
    })

    test(`menu at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      await openUserMenu(page, E2E_USERS.IT_STAFF, 'IT Staff')
      await takeScreenshot(page, 'staff-queue', `${name}-menu`, { viewportOnly: true })
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      const search = page.getByLabel('Search', { exact: true })
      await tabTo(page, search)
      await expect(search).toHaveCSS('border-color', TOKENS.secondaryGreen)
      await tabTo(page, firstTicketLink(page))
      await takeScreenshot(page, 'staff-queue', `${name}-focus`, { viewportOnly: true })
    })

    test(`no-results state at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      await page.getByLabel('Search', { exact: true }).fill('no-such-ticket-xyz')
      await expect(page.getByText('No tickets match your search or filters.')).toBeVisible()
      await takeScreenshot(page, 'staff-queue', `${name}-no-results`)
    })

    test(`filters at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openQueue(page)
      await openFilters(page)
      // A select shows its arrow, and the checkbox the field border.
      await expect(page.getByLabel('Status', { exact: true })).not.toHaveCSS('background-image', 'none')
      const checkbox = page.getByLabel('Requester says resolved')
      await expect(checkbox).toHaveCSS('border-color', TOKENS.fieldBorder)
      await expect(checkbox).toHaveCSS('background-color', TOKENS.surface)
      // A long owner name does not widen the Owner select on tablet, where
      // the controls wrap to two rows (ui-spec.md §8.4): it is cut short
      // with an ellipsis, and is then also the tooltip (§11).
      const owner = page.getByLabel('Owner', { exact: true })
      await owner.selectOption({ label: E2E_USERS.IT_STAFF.name })
      await expect(owner).toHaveAttribute('title', E2E_USERS.IT_STAFF.name)
      if (name === 'tablet') {
        await expect(owner).toHaveCSS('text-overflow', 'ellipsis')
        expect((await owner.boundingBox())!.width).toBeLessThanOrEqual(240)
      }
      await owner.selectOption({ label: 'Any owner' })
      // Only mobile hides the filters until they are asked for.
      if (name === 'mobile') await takeScreenshot(page, 'staff-queue', 'mobile-filters-open')
    })
  }

  test('loading state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    const release = await holdRequests(page, QUEUE_REQUEST)
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto('/staff/queue')
    await expect(page.getByText('Loading tickets…')).toBeVisible()
    await expect(page.locator('.tk-queue__skeleton .placeholder').first()).toHaveCSS(
      'background-color',
      TOKENS.readonlyBackground,
    )
    await takeScreenshot(page, 'staff-queue', 'desktop-loading')
    release()
  })

  test('failure state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await page.route(QUEUE_REQUEST, (route) => route.abort())
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto('/staff/queue')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await takeScreenshot(page, 'staff-queue', 'desktop-failure')
  })

  test('forbidden for a Requester at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto('/staff/queue')
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    // Its way out is a 44px tap target (ui-spec.md §11).
    const wayOut = await page.getByRole('button', { name: 'Go to Dashboard' }).boundingBox()
    expect(wayOut!.height).toBeGreaterThanOrEqual(44)
    await takeScreenshot(page, 'staff-queue', 'mobile-forbidden')
  })
})
