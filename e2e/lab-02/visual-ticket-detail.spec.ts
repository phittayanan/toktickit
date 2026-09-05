import { test } from '@playwright/test'
import { BREAKPOINTS, signInAsSeedRequester } from './support/requester'

// VIS-03 (docs/lab-02/tests.md): Ticket Detail at desktop/tablet/mobile,
// using a seeded Ticket that has both an active and a removed Attachment
// so both chip states (ui-spec.md §3) are visible in the screenshot.
const TICKET_NUMBER = 'TKT-2026-000073'

async function openTicket(page: import('@playwright/test').Page) {
  await signInAsSeedRequester(page)
  await page.getByPlaceholder(/search by ticket number/i).fill(TICKET_NUMBER)
  const match = page.getByText(TICKET_NUMBER).locator('visible=true').first()
  await match.waitFor()
  await match.click()
}

test.describe('visual: Ticket Detail', () => {
  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openTicket(page)
      await page.getByText('Attachments').first().waitFor()
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/ticket-detail/${name}.png`,
        fullPage: true,
      })
    })
  }
})
