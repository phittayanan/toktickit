import { expect, test, type Page } from '@playwright/test'
import { createTicketFor, type ArrangedTicket } from '../lab-03/support/api'
import { BREAKPOINTS } from '../lab-03/support/screenshots'
import { signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'
import {
  addActionFor,
  card,
  editActionElsewhere,
  openRequesterTicket,
  openStaffTicket,
  rowOf,
  type ArrangedAction,
} from './support/actionsTaken'

// VIS-03 (docs/lab-04/tests.md): the Actions Taken card, staff and Requester,
// at the three widths, plus the form and the conflict. "Resolved not
// available" comes with the Ticket status control.
function screenshot(page: Page, name: string) {
  return page.screenshot({
    path: `artifacts/lab-04/screenshots/actions-taken/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

test.describe('visual: Actions Taken card', () => {
  test.describe.configure({ mode: 'default' })

  const STAFF = E2E_USERS.IT_STAFF
  let ticket: ArrangedTicket
  let planned: ArrangedAction

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
    planned = await addActionFor(STAFF, ticket, { description: 'Order a spare roller.' })
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
  }

  test('conflict', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, STAFF)
    await openStaffTicket(page, ticket)
    await rowOf(page, 'Order a spare roller.').getByRole('button', { name: 'Edit', exact: true }).click()
    await editActionElsewhere(STAFF, ticket, planned, 'Order two spare rollers.')
    const form = page.getByRole('form', { name: 'Edit action' })
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form.getByRole('button', { name: 'Reload' })).toBeVisible()
    await screenshot(page, 'conflict')
  })
})
