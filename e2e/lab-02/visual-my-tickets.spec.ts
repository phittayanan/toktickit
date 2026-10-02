import { test } from '@playwright/test'
import { BREAKPOINTS, arrangeTicketWithAttachments, signInAsRequester } from './support/requester'

// VIS-02 (docs/lab-02/tests.md): My Tickets at desktop/tablet/mobile —
// desktop table vs. mobile card behavior (ui-spec.md §8), plus a
// no-results state at mobile.
test.describe('visual: My Tickets', () => {
  // The list needs at least one Ticket of the signed-in Requester.
  test.beforeAll(async () => {
    await arrangeTicketWithAttachments()
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsRequester(page)
      await page.getByText(/TKT-2026-\d{6}/).locator('visible=true').first().waitFor()
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/my-tickets/${name}.png`,
        fullPage: true,
      })
    })
  }

  test('no-results state at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsRequester(page)
    await page.getByPlaceholder(/search by ticket number/i).fill('no-such-ticket-xyz')
    await page.getByText('No tickets match your search or filters.').waitFor()
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/mobile-no-results.png',
      fullPage: true,
    })
  })
})
