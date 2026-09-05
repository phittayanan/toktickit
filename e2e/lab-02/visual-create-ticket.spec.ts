import { test } from '@playwright/test'
import { BREAKPOINTS, signInAsSeedRequester } from './support/requester'

// VIS-01 (docs/lab-02/tests.md): Create Ticket at desktop/tablet/mobile,
// checked against ui-spec.md §13's visual checklist.
test.describe('visual: Create Ticket', () => {
  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsSeedRequester(page)
      await page.getByRole('button', { name: 'Create Ticket' }).first().click()
      await page.getByLabel(/summary/i).waitFor()
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/${name}.png`,
        fullPage: true,
      })
    })
  }
})
