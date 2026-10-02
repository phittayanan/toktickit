import { test, type Page } from '@playwright/test'
import { BREAKPOINTS, arrangeTicketWithAttachments, signInAsRequester } from './support/requester'

// VIS-03 (docs/lab-02/tests.md): Ticket Detail at desktop/tablet/mobile,
// using a Ticket that has both an active and a removed Attachment so both
// chip states (ui-spec.md §3) are visible in the screenshot.
let ticketNumber: string

async function openTicket(page: Page) {
  await signInAsRequester(page)
  await page.getByPlaceholder(/search by ticket number/i).fill(ticketNumber)
  const match = page.getByText(ticketNumber).locator('visible=true').first()
  await match.waitFor()
  await match.click()
}

test.describe('visual: Ticket Detail', () => {
  test.beforeAll(async () => {
    ticketNumber = (await arrangeTicketWithAttachments()).ticketNumber
  })

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
