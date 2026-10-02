import { expect, test, type Page } from '@playwright/test'
import type { ArrangedTicket } from './support/api'
import { signInAsUser } from './support/signIn'
import { E2E_USERS } from './support/users'
import { BREAKPOINTS, takeScreenshot } from './support/screenshots'
import { TOKENS, createNewTicket, createWorkedTicket, holdRequests, openUserMenu, tabTo } from './support/visualData'

// VIS-02 (docs/lab-03/tests.md): Requester Ticket Detail at desktop,
// tablet, and mobile, on a Ticket that IT Staff are working and both sides
// have commented on, plus the states the ui-spec.md §13 checklist is judged
// by: the open menu, keyboard focus, validation, no comments yet, loading,
// failure, and not-found.
test.describe('visual: Requester Ticket Detail', () => {
  test.describe.configure({ mode: 'default' })

  let ticket: ArrangedTicket

  test.beforeAll(async () => {
    ticket = await createWorkedTicket()
  })

  async function openTicket(page: Page) {
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Public Comments (2)' })).toBeVisible()
    await expect(page.getByText('The trust store on the laboratory image is out of date.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible()
  }

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openTicket(page)
      // A read-only value sits on the read-only surface.
      await expect(page.locator('[aria-readonly="true"]').first()).toHaveCSS(
        'background-color',
        TOKENS.readonlyBackground,
      )
      // The file chooser's button is on that surface too.
      const fileButton = await page
        .locator('input[type="file"]')
        .evaluate((input) => getComputedStyle(input, '::file-selector-button').backgroundColor)
      expect(fileButton).toBe(TOKENS.readonlyBackground)
      await takeScreenshot(page, 'requester-ticket-detail', name)
    })

    test(`menu at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openTicket(page)
      await openUserMenu(page, E2E_USERS.REQUESTER, 'Requester')
      await takeScreenshot(page, 'requester-ticket-detail', `${name}-menu`, { viewportOnly: true })
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openTicket(page)
      await tabTo(page, page.getByRole('button', { name: 'Withdraw' }))
      await takeScreenshot(page, 'requester-ticket-detail', `${name}-focus`, { viewportOnly: true })
    })

    test(`comment validation at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openTicket(page)
      await page.getByRole('button', { name: 'Post Comment' }).click()
      await expect(page.getByText('A comment is required.')).toBeVisible()
      await expect(page.getByLabel('Add a comment')).toHaveCSS('border-color', TOKENS.error)
      await takeScreenshot(page, 'requester-ticket-detail', `${name}-validation`)
    })
  }

  test('no comments yet at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    const fresh = await createNewTicket()
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto(`/tickets/${fresh.id}`)
    await expect(page.getByText('No comments yet.')).toBeVisible()
    await takeScreenshot(page, 'requester-ticket-detail', 'mobile-empty-comments')
  })

  test('loading state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    const release = await holdRequests(page, `**/api/tickets/${ticket.id}`)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('Loading ticket…')).toBeVisible()
    await expect(page.getByRole('status').locator('.spinner-border')).toBeVisible()
    await takeScreenshot(page, 'requester-ticket-detail', 'desktop-loading')
    release()
  })

  test('failure state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.route(`**/api/tickets/${ticket.id}`, (route) => route.abort())
    await page.goto(`/tickets/${ticket.id}`)
    const alert = page.getByRole('alert')
    await expect(alert).toHaveClass(/tk-alert--error/)
    // The safe failure of ui-spec.md §2.3, with nothing of the error itself.
    await expect(alert).toHaveText('Something went wrong. Please try again. Retry')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    await takeScreenshot(page, 'requester-ticket-detail', 'desktop-failure')
    // Retry loads the Ticket once the connection is back.
    await page.unroute(`**/api/tickets/${ticket.id}`)
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  })

  test('not found at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto('/tickets/999999999')
    const notFound = page.getByRole('heading', { name: 'Ticket not found' })
    await expect(notFound).toBeVisible()
    // On a card, as the other feedback pages are.
    const card = notFound.locator('..')
    await expect(card).toHaveCSS('background-color', TOKENS.surface)
    // Its button sits inside the card, clear of the edges.
    const cardBox = (await card.boundingBox())!
    const buttonBox = (await page.getByRole('button', { name: 'Back to My Tickets', exact: true }).boundingBox())!
    expect(buttonBox.width).toBeLessThanOrEqual(cardBox.width - 32)
    await takeScreenshot(page, 'requester-ticket-detail', 'mobile-not-found')
  })
})
