import { test, expect, type Page } from '@playwright/test'
import { apiSessionFor, createTicketFor, startWorkOn } from '../lab-03/support/api'
import { expectDialogOpensTrapsAndReturnsFocus, expectKeyboardReachable } from '../lab-03/support/keyboard'
import { signInAs, signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'
import { addActionFor, card, openRequesterTicket, openStaffTicket, rowOf } from './support/actionsTaken'

// E2E-11 (docs/lab-04/tests.md; AC-47, ui-spec.md §12): a keyboard-only pass
// over every Lab 4 screen, the Actions Taken form, and the confirmation.
// Controls are reached by pressing Tab and worked with Enter, Space, and
// Escape; nothing is clicked.

// A focus ring that is still fading in has no settled style to inspect.
test.use({ contextOptions: { reducedMotion: 'reduce' } })

const wholePage = (page: Page) => page.locator('body')

test('E2E-11 Requester Dashboard', async ({ page }) => {
  await signInAs(page, 'REQUESTER')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  const open = page.getByRole('link', { name: /^Open Tickets: \d+$/ })
  await expect(open).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  await open.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tickets\?/)
})

for (const role of ['IT_STAFF', 'ADMINISTRATOR'] as const) {
  test(`E2E-11 ${role === 'IT_STAFF' ? 'IT Staff' : 'Administrator'} Dashboard`, async ({ page }) => {
    await signInAs(page, role)
    const unassigned = page.getByRole('link', { name: /^Unassigned: \d+$/ })
    await expect(unassigned).toBeVisible()

    await expectKeyboardReachable(page, wholePage(page))

    // My Planned moves focus to its list instead of leaving the page.
    const planned = page.getByRole('link', { name: /^My Planned Actions Taken: \d+$/ })
    await planned.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('*:focus')).toHaveAccessibleName(/\S/)
    await expect(page).toHaveURL(/\/staff\/dashboard/)

    await unassigned.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/staff\/queue\?/)
  })
}

test('E2E-11 Staff Ticket Detail: the card, the form, and the confirmation', async ({ page }) => {
  test.slow()
  const staff = E2E_USERS.IT_STAFF
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-11 staff card ${Date.now()}`)
  await addActionFor(staff, ticket, { description: 'Swap the toner.' })
  await addActionFor(staff, ticket, { description: 'Clean the rollers.', status: 'DONE', result: 'Prints clean.' })

  await signInAsUser(page, staff)
  await openStaffTicket(page, ticket)
  await expect(rowOf(page, 'Swap the toner.')).toBeVisible()

  await expectKeyboardReachable(page, wholePage(page))

  // A row's disclosure is a real button that says whether it is open.
  const disclosure = card(page).getByRole('button', { name: 'Clean the rollers.' })
  await disclosure.focus()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Space')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

  // Opening the form moves focus to its first field; closing it gives
  // focus back to the button that opened it.
  const add = card(page).getByRole('button', { name: 'Add' })
  await add.focus()
  await page.keyboard.press('Enter')
  const form = page.getByRole('form', { name: 'Add action' })
  await expect(form.getByLabel('Date/Time')).toBeFocused()
  // From the date field's last segment: Tab moves between its segments, which
  // the walk would take for having come back round.
  await form.getByLabel('Description').focus()
  await page.keyboard.press('Shift+Tab')
  await expectKeyboardReachable(page, form)
  await form.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Enter')
  await expect(form).toHaveCount(0)
  await expect(add).toBeFocused()

  // Mark Done moves focus to Result, the field it asks for.
  const markDone = rowOf(page, 'Swap the toner.').getByRole('button', { name: 'Mark Done' })
  await markDone.focus()
  await page.keyboard.press('Enter')
  const doneForm = card(page).getByRole('form')
  await expect(doneForm.getByLabel('Result')).toBeFocused()
  await doneForm.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Enter')
  await expect(markDone).toBeFocused()

  // The confirmation holds focus and gives it back.
  await expectDialogOpensTrapsAndReturnsFocus(
    page,
    rowOf(page, 'Swap the toner.').getByRole('button', { name: 'Cancel action' }),
    page.getByRole('dialog', { name: 'Cancel action' }),
  )
})

test('E2E-11 the Resolved reason link reaches the card', async ({ page }) => {
  const staff = E2E_USERS.IT_STAFF
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-11 reason ${Date.now()}`)
  const api = await apiSessionFor(staff)
  const me = (await api.get('/api/auth/me').then((res) => res.json())) as { id: number }
  await api.dispose()
  await startWorkOn({ ...staff, id: me.id }, ticket)
  await addActionFor(staff, ticket, { description: 'Replace the fuser.' })

  await signInAsUser(page, staff)
  await openStaffTicket(page, ticket)

  const reasonLink = page.getByRole('region', { name: 'Manage this ticket' }).getByRole('link', { name: 'Go to Actions Taken' })
  await reasonLink.focus()
  await page.keyboard.press('Enter')
  await expect(card(page)).toBeFocused()
})

test('E2E-11 Requester Ticket Detail with the read-only card', async ({ page }) => {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, `E2E-11 requester card ${Date.now()}`)
  await addActionFor(E2E_USERS.IT_STAFF, ticket, { description: 'Check the cable.' })

  await signInAsUser(page, E2E_USERS.REQUESTER)
  await openRequesterTicket(page, ticket)

  await expectKeyboardReachable(page, wholePage(page))

  const disclosure = card(page).getByRole('button', { name: 'Check the cable.' })
  await disclosure.focus()
  await page.keyboard.press('Enter')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(card(page).getByRole('button', { name: 'Add' })).toHaveCount(0)
})
