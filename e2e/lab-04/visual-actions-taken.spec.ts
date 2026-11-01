import { expect, test, type Page } from '@playwright/test'
import { apiSessionFor, createTicketFor, startWorkOn, type ArrangedTicket } from '../lab-03/support/api'
import { BREAKPOINTS } from '../lab-03/support/screenshots'
import { signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'
import {
  addActionFor,
  card,
  editActionElsewhere,
  openRequesterTicket,
  openStaffTicket,
} from './support/actionsTaken'

// VIS-03 (docs/lab-04/tests.md): the Actions Taken card, staff and Requester,
// at the three widths, plus the form, the conflict, and Resolved not available.
async function screenshot(page: Page, name: string) {
  const pageWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  expect(pageWidth, 'no horizontal page scroll').toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({
    path: `artifacts/lab-04/screenshots/actions-taken/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

test.describe('visual: Actions Taken card', () => {
  test.describe.configure({ mode: 'default' })

  const STAFF = E2E_USERS.IT_STAFF
  let ticket: ArrangedTicket
  let oneOfEach: ArrangedTicket
  let gateUnmet: ArrangedTicket

  test.beforeAll(async () => {
    ticket = await createTicketFor(E2E_USERS.REQUESTER, 'Printer in room 301 keeps jamming')
    await addActionFor(STAFF, ticket, {
      description: 'Replaced the feed roller.',
      status: 'DONE',
      result: 'Printed 50 pages without a jam.',
      followUpRequired: true,
      followUpNote: 'Check the tray again next week.',
      attachmentNotes: 'See roller-photo.png.',
    })
    await addActionFor(STAFF, ticket, { description: 'Order a spare roller.' })
    oneOfEach = await createTicketFor(E2E_USERS.REQUESTER, 'Monitor in room 118 keeps flickering')
    await addActionFor(STAFF, oneOfEach, { description: 'Order a spare cable.' })

    const api = await apiSessionFor(STAFF)
    const me = await api.get('/api/auth/me').then((res) => res.json())
    await api.dispose()
    gateUnmet = await createTicketFor(E2E_USERS.REQUESTER, 'Laptop in room 214 will not charge')
    await startWorkOn({ ...STAFF, id: me.id }, gateUnmet)
    await addActionFor(STAFF, gateUnmet, { description: 'Order a replacement charger.' })
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`staff at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, STAFF)
      await openStaffTicket(page, ticket)
      await card(page).getByRole('button', { name: 'Replaced the feed roller.' }).click()
      await screenshot(page, `staff-${name}`)
    })

    test(`Requester at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.REQUESTER)
      await openRequesterTicket(page, ticket)
      await card(page).getByRole('button', { name: 'Replaced the feed roller.' }).click()
      await screenshot(page, `requester-${name}`)
    })

    test(`form at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, STAFF)
      await openStaffTicket(page, ticket)
      await card(page).getByRole('button', { name: 'Add' }).click()
      const form = page.getByRole('form', { name: 'Add action' })
      await form.getByLabel('Follow-up required').check()
      await form.getByRole('button', { name: 'Save' }).click()
      await expect(form.getByText('Description is required.')).toBeVisible()
      await screenshot(page, `form-${name}`)
    })

    test(`Resolved not available at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, STAFF)
      await openStaffTicket(page, gateUnmet)
      const select = page.getByLabel('Current Status')
      await expect(select.getByRole('option', { name: 'Resolved (not available)' })).toBeDisabled()
      await expect(page.getByText('Done: 1. Planned: 1.')).toBeVisible()
      // A native select's popup is not in a page screenshot, so its options
      // are shown as a list.
      await select.evaluate((element: HTMLSelectElement) => {
        element.size = element.options.length
      })
      await screenshot(page, `resolved-not-available-${name}`)
    })

    test(`Cancel action confirmation at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, STAFF)
      await openStaffTicket(page, oneOfEach)
      await card(page).getByRole('button', { name: 'Cancel action' }).click()
      await expect(page.getByRole('dialog', { name: 'Cancel action' })).toBeVisible()
      await screenshot(page, `cancel-confirmation-${name}`)
    })

    test(`conflict at ${name}`, async ({ page }) => {
      const conflicted = await createTicketFor(E2E_USERS.REQUESTER, `Scanner in room 118 at ${name}`)
      const stale = await addActionFor(STAFF, conflicted, { description: 'Order a spare roller.' })
      await page.setViewportSize(size)
      await signInAsUser(page, STAFF)
      await openStaffTicket(page, conflicted)
      await card(page).getByRole('button', { name: 'Edit', exact: true }).click()
      await editActionElsewhere(STAFF, conflicted, stale, 'Order two spare rollers.')
      const form = page.getByRole('form', { name: 'Edit action' })
      await form.getByRole('button', { name: 'Save' }).click()
      await expect(form.getByRole('button', { name: 'Reload' })).toBeVisible()
      await screenshot(page, name === 'desktop' ? 'conflict' : `conflict-${name}`)
    })
  }
})
