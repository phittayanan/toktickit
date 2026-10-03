import { expect, test, type Page } from '@playwright/test'
import type { ArrangedTicket } from './support/api'
import { signInAsUser } from './support/signIn'
import { E2E_USERS } from './support/users'
import { BREAKPOINTS, takeScreenshot } from './support/screenshots'
import {
  TOKENS,
  changeStatusElsewhere,
  createNewTicket,
  createWorkedTicket,
  expectFocusKept,
  expectSelectTextFits,
  holdRequests,
  tabTo,
} from './support/visualData'

// VIS-04 (docs/lab-03/tests.md): Staff Ticket Detail at desktop, tablet,
// and mobile, plus Internal Notes and the Resolved dialog, and the other
// states the ui-spec.md §13 checklist is judged by: keyboard focus,
// conflict, loading, failure, forbidden, and not-found.
test.describe('visual: Staff Ticket Detail', () => {
  test.describe.configure({ mode: 'default' })

  let ticket: ArrangedTicket

  test.beforeAll(async () => {
    ticket = await createWorkedTicket()
  })

  async function openTicket(page: Page, opened: ArrangedTicket = ticket) {
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto(`/staff/tickets/${opened.id}`)
    await expect(page.getByRole('heading', { level: 1, name: opened.ticketNumber })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Public Comments \(\d+\)/ })).toBeVisible()
  }

  async function openWorkedTicket(page: Page) {
    await openTicket(page)
    await expect(page.getByRole('tab', { name: 'Public Comments (2)' })).toBeVisible()
    await expect(page.getByText('It fails on every computer in room 301.')).toBeVisible()
  }

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openWorkedTicket(page)
      await expect(page.getByText('Requester: appears resolved')).toBeVisible()

      // The Operations card: each select shows its arrow and all of its
      // text, and a button that has nothing to save stays Zen Green.
      for (const label of ['Ticket Owner', 'IT Priority', 'Current Status']) {
        const select = page.getByLabel(label, { exact: true })
        await expect(select).not.toHaveCSS('background-image', 'none')
        await expectSelectTextFits(select)
      }
      // On tablet the three controls are in a row (ui-spec.md §9.7), and
      // stay level whatever wraps above them.
      if (name === 'tablet') {
        const tops = await page
          .locator('.tk-ops__control select')
          .evaluateAll((selects) => selects.map((select) => Math.round(select.getBoundingClientRect().top)))
        expect(new Set(tops).size, `select tops ${tops.join(', ')}`).toBe(1)
      }
      const updateOwner = page.getByRole('button', { name: 'Update Owner' })
      await expect(updateOwner).toBeDisabled()
      await expect(updateOwner).toHaveCSS('color', TOKENS.primaryGreen)
      await expect(updateOwner).toHaveCSS('border-color', TOKENS.primaryGreen)

      // The breadcrumb reads as one line: its link is level with the
      // Ticket Number beside it.
      const middles = await page
        .locator('.tk-breadcrumb li')
        .evaluateAll((items) =>
          items.map((item) => {
            const content = document.createRange()
            content.selectNodeContents(item)
            const box = content.getBoundingClientRect()
            return box.top + box.height / 2
          }),
        )
      expect(Math.abs(middles[0] - middles[1]), 'breadcrumb alignment').toBeLessThanOrEqual(2)
      await takeScreenshot(page, 'staff-ticket-detail', name)
    })

    test(`Internal Notes at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openWorkedTicket(page)
      await page.getByRole('tab', { name: 'Internal Notes (2)' }).click()
      await expect(page.getByText('Internal — never shown to the Requester.')).toBeVisible()
      await expect(page.getByText('Root cause: the laboratory image still ships the 2025 trust store.')).toBeVisible()
      await takeScreenshot(page, 'staff-ticket-detail', `${name}-internal-notes`)
    })

    test(`Resolved dialog at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openWorkedTicket(page)
      await page.getByLabel('Current Status').selectOption({ label: 'Resolved' })
      await page.getByRole('button', { name: 'Update Status' }).click()
      const dialog = page.getByRole('dialog', { name: `Resolve ${ticket.ticketNumber}` })
      await expect(dialog.getByLabel('Resolution Summary')).toBeVisible()
      await expectFocusKept(page, dialog)

      // Confirmed empty, so the validation message is in the picture.
      await dialog.getByRole('button', { name: 'Mark as Resolved' }).click()
      await expect(dialog.getByText('A resolution summary is required.')).toBeVisible()
      await takeScreenshot(page, 'staff-ticket-detail', `${name}-resolve-dialog`, { viewportOnly: true })
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openWorkedTicket(page)
      const owner = page.getByLabel('Ticket Owner', { exact: true })
      await tabTo(page, owner)
      await expect(owner).toHaveCSS('border-color', TOKENS.secondaryGreen)
      await takeScreenshot(page, 'staff-ticket-detail', `${name}-focus`, { viewportOnly: true })
    })
  }

  test('conflict at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    const contested = await createNewTicket()
    await openTicket(page, contested)
    await changeStatusElsewhere(contested, 'OPEN', 'NEW')
    await page.getByLabel('Current Status').selectOption({ label: 'Open' })
    await page.getByRole('button', { name: 'Update Status' }).click()
    await expect(page.getByRole('alert')).toContainText('This ticket was changed by someone else.')
    await takeScreenshot(page, 'staff-ticket-detail', 'desktop-conflict')
  })

  test('loading state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    const release = await holdRequests(page, `**/api/staff/tickets/${ticket.id}`)
    await page.goto(`/staff/tickets/${ticket.id}`)
    await expect(page.getByText('Loading ticket…')).toBeVisible()
    await takeScreenshot(page, 'staff-ticket-detail', 'desktop-loading')
    release()
  })

  test('failure state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.route(`**/api/staff/tickets/${ticket.id}`, (route) => route.abort())
    await page.goto(`/staff/tickets/${ticket.id}`)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await takeScreenshot(page, 'staff-ticket-detail', 'desktop-failure')
  })

  test('forbidden for a Requester at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto(`/staff/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    await takeScreenshot(page, 'staff-ticket-detail', 'mobile-forbidden')
  })

  test('not found at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto('/staff/tickets/999999999')
    await expect(page.getByRole('heading', { name: 'Ticket not found' })).toBeVisible()
    await takeScreenshot(page, 'staff-ticket-detail', 'desktop-not-found')
  })
})
