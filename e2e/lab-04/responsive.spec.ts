import { expect, test, type Page } from '@playwright/test'
import { createTicketFor, type ArrangedTicket } from '../lab-03/support/api'
import { BREAKPOINTS } from '../lab-03/support/screenshots'
import { signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'
import { addActionFor, card, openRequesterTicket, openStaffTicket, rowOf } from './support/actionsTaken'

// VIS-04 (docs/lab-04/tests.md), the Actions Taken card: a table on desktop
// and tablet, cards on mobile, no horizontal scroll, and 44px tap targets on
// mobile (ui-spec.md §8.9, §11).
const LONG_TEXT = `${'A very long description of what was done '.repeat(8)}end`

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test.describe('responsive: Actions Taken card', () => {
  let ticket: ArrangedTicket

  test.beforeAll(async () => {
    ticket = await createTicketFor(E2E_USERS.REQUESTER, 'VIS-04 Actions Taken')
    await addActionFor(E2E_USERS.IT_STAFF, ticket, {
      description: LONG_TEXT,
      followUpRequired: true,
      followUpNote: LONG_TEXT,
    })
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`staff at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.IT_STAFF)
      await openStaffTicket(page, ticket)
      const description = LONG_TEXT.trim()
      const row = rowOf(page, description.slice(0, 40))
      await expect(row.getByRole('button', { name: 'Mark Done' })).toBeVisible()
      await expectNoHorizontalScroll(page)

      await expect(row).toHaveCSS('display', name === 'mobile' ? 'grid' : 'table-row')
      await expect(card(page).locator('thead')).toHaveCSS('display', name === 'mobile' ? 'none' : 'table-header-group')

      // Date and status on top, then the description, then the buttons.
      if (name === 'mobile') {
        const box = (text: string) => row.getByRole('button', { name: text }).boundingBox()
        const disclosure = (await row.locator('.tk-actions__disclosure').boundingBox())!
        const edit = (await box('Edit'))!
        const done = (await box('Mark Done'))!
        expect(edit.y).toBeGreaterThan(disclosure.y)
        expect(edit.width).toBe(done.width)
        expect(edit.width).toBeGreaterThan(size.width / 2)
        for (const control of await card(page).getByRole('button').all()) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        }
      }

      await card(page).locator('.tk-actions__disclosure').click()
      await expect(card(page).getByRole('region', { name: /^Details of/ })).toBeVisible()
      await expectNoHorizontalScroll(page)

      await row.getByRole('button', { name: 'Edit', exact: true }).click()
      const form = page.getByRole('form', { name: 'Edit action' })
      await expect(form.getByLabel('Description')).toBeVisible()
      await expectNoHorizontalScroll(page)

      // Two columns on desktop, one below it.
      const date = (await form.getByLabel('Date/Time').boundingBox())!
      const description2 = (await form.getByLabel('Description').boundingBox())!
      expect(date.y === description2.y).toBe(name === 'desktop')
      if (name === 'mobile') {
        const save = (await form.getByRole('button', { name: 'Save' }).boundingBox())!
        expect(save.height).toBeGreaterThanOrEqual(44)
        expect(save.width).toBeGreaterThan(size.width / 2)
      }
    })

    test(`Requester at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.REQUESTER)
      await openRequesterTicket(page, ticket)
      await expect(card(page).locator('.tk-actions__disclosure')).toBeVisible()
      await expectNoHorizontalScroll(page)
      await card(page).locator('.tk-actions__disclosure').click()
      await expect(card(page).getByRole('region', { name: /^Details of/ })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })
  }
})
