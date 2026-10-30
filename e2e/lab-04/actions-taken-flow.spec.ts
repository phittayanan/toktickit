import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiSessionFor, createTicketFor } from '../lab-03/support/api'
import { signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS, createDisposableUser, type E2EUser } from '../lab-03/support/users'
import {
  actionsOf,
  addActionFor,
  card,
  openRequesterTicket,
  openStaffTicket,
  rowOf,
} from './support/actionsTaken'

const STAFF = E2E_USERS.IT_STAFF
const REQUESTER = E2E_USERS.REQUESTER

// A second person at their own browser.
async function signedInPage(browser: Browser, user: E2EUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signInAsUser(page, user)

  return page
}

test.describe('Actions Taken', () => {
  // E2E-01 (AC-01, AC-07, AC-12, AC-13).
  test('staff record, assign, finish, and cancel actions; the Requester reads them all', async ({ page, browser }) => {
    const colleague = createDisposableUser('IT_STAFF')
    const ticket = await createTicketFor(REQUESTER, 'E2E-01 several actions on one Ticket')
    await signInAsUser(page, STAFF)
    await openStaffTicket(page, ticket)
    await expect(card(page).getByText('No actions recorded yet.')).toBeVisible()

    // Below "Manage this ticket", above the tabs.
    const top = async (name: 'heading' | 'tablist') =>
      (await (name === 'heading'
        ? page.getByRole('heading', { name: 'Manage this ticket' })
        : page.getByRole('tablist')
      ).boundingBox())!.y
    const cardBox = (await card(page).boundingBox())!
    expect(cardBox.y).toBeGreaterThan(await top('heading'))
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(await top('tablist'))

    await card(page).getByRole('button', { name: 'Add' }).click()
    const form = page.getByRole('form', { name: 'Add action' })
    await form.getByLabel('Description').fill('Replace the battery')
    await form.getByLabel('Performed by').selectOption({ label: colleague.name })
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Action added.')).toBeVisible()
    await expect(form).toBeHidden()

    await card(page).getByRole('button', { name: 'Add' }).click()
    await form.getByLabel('Description').fill('Order a charger')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(card(page).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible()

    // The colleague performs the first one. It leaves the Ticket Owner alone.
    const colleaguePage = await signedInPage(browser, colleague)
    await openStaffTicket(colleaguePage, ticket)
    await rowOf(colleaguePage, 'Replace the battery').getByRole('button', { name: 'Mark Done' }).click()
    const done = colleaguePage.getByRole('form', { name: 'Mark action Done' })
    await expect(done.getByLabel('Status')).toBeDisabled()
    await expect(done.getByLabel('Result')).toBeFocused()
    await done.getByLabel('Result').fill('Charge holds for 7 hours.')
    await done.getByRole('button', { name: 'Mark Done' }).click()
    await expect(colleaguePage.getByText('Action marked Done.')).toBeVisible()
    await expect(rowOf(colleaguePage, 'Replace the battery').getByText('Done')).toBeVisible()
    await expect(colleaguePage.getByLabel('Ticket Owner', { exact: true })).toHaveValue('')
    await colleaguePage.context().close()

    await page.reload()
    await rowOf(page, 'Order a charger').getByRole('button', { name: 'Cancel action' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Cancel action' }).click()
    await expect(page.getByText('Action cancelled.')).toBeVisible()
    await expect(rowOf(page, 'Order a charger').getByText('Cancelled')).toBeVisible()
    await expect(rowOf(page, 'Order a charger').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)

    const requesterPage = await signedInPage(browser, REQUESTER)
    await openRequesterTicket(requesterPage, ticket)
    await expect(card(requesterPage).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible()
    await expect(card(requesterPage).getByText('Visible to you and IT Staff.')).toBeVisible()
    await expect(rowOf(requesterPage, 'Order a charger').getByText('Cancelled')).toBeVisible()
    await card(requesterPage).getByRole('button', { name: 'Replace the battery' }).click()
    await expect(card(requesterPage).getByText('Charge holds for 7 hours.')).toBeVisible()
    await expect(card(requesterPage).getByText(colleague.name)).toBeVisible()
    for (const name of ['Add', 'Edit', 'Mark Done', 'Cancel action']) {
      await expect(card(requesterPage).getByRole('button', { name, exact: true })).toHaveCount(0)
    }
    await requesterPage.context().close()
  })

  // E2E-02 (AC-05, AC-06).
  test('an inactive user is not offered, and other IT Staff can only read', async ({ page }) => {
    const inactive = createDisposableUser('IT_STAFF', { isActive: false })
    const other = createDisposableUser('IT_STAFF')
    const ticket = await createTicketFor(REQUESTER, 'E2E-02 edit rights')
    const action = await addActionFor(STAFF, ticket, { description: 'Only mine to edit' })

    await signInAsUser(page, other)
    await openStaffTicket(page, ticket)
    await expect(rowOf(page, 'Only mine to edit').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await card(page).getByRole('button', { name: 'Add' }).click()
    const options = await page
      .getByRole('form', { name: 'Add action' })
      .getByLabel('Performed by')
      .locator('option')
      .allTextContents()
    expect(options).toContain(STAFF.name)
    expect(options).not.toContain(inactive.name)

    const api = await apiSessionFor(other)
    const refused = await api.put(`/api/staff/tickets/${ticket.id}/actions-taken/${action.id}`, {
      data: {
        expectedVersion: action.version,
        actionAt: action.actionAt,
        description: 'Not mine',
        result: null,
        status: 'PLANNED',
        assigneeId: action.assignee.id,
        followUpRequired: false,
        followUpNote: null,
        attachmentNotes: null,
      },
    })
    expect(refused.status()).toBe(403)
    await api.dispose()
  })

  // E2E-03 (AC-09).
  test('the second of two editors keeps the typed data, then reloads', async ({ page, browser }) => {
    const ticket = await createTicketFor(REQUESTER, 'E2E-03 two editors')
    await addActionFor(STAFF, ticket, { description: 'Edited twice' })
    await signInAsUser(page, STAFF)
    await openStaffTicket(page, ticket)
    await rowOf(page, 'Edited twice').getByRole('button', { name: 'Edit', exact: true }).click()

    const firstPage = await signedInPage(browser, STAFF)
    await openStaffTicket(firstPage, ticket)
    await rowOf(firstPage, 'Edited twice').getByRole('button', { name: 'Edit', exact: true }).click()
    await firstPage.getByRole('form', { name: 'Edit action' }).getByLabel('Description').fill('Saved first')
    await firstPage.getByRole('form', { name: 'Edit action' }).getByRole('button', { name: 'Save' }).click()
    await expect(firstPage.getByText('Action updated.')).toBeVisible()
    await firstPage.context().close()

    const form = page.getByRole('form', { name: 'Edit action' })
    await form.getByLabel('Description').fill('Saved second')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form.getByText('This action was changed by someone else.')).toBeVisible()
    await expect(form.getByLabel('Description')).toHaveValue('Saved second')

    await form.getByRole('button', { name: 'Reload' }).click()
    await expect(form.getByLabel('Description')).toHaveValue('Saved first')
  })

  // AC-15, in a real browser.
  test('markup in an action is shown as text to staff and the Requester', async ({ page }) => {
    const markup = '<img src=x onerror="window.injected=1"><script>window.injected=1</script>'
    const ticket = await createTicketFor(REQUESTER, 'AC-15 literal text')
    await addActionFor(STAFF, ticket, { description: markup })

    await signInAsUser(page, REQUESTER)
    await openRequesterTicket(page, ticket)
    await card(page).getByRole('button', { name: markup }).click()
    await expect(card(page).getByRole('region', { name: `Details of ${markup}` }).getByText(markup)).toBeVisible()
    await expect(card(page).locator('img, script')).toHaveCount(0)
    expect(await page.evaluate(() => 'injected' in window)).toBe(false)
  })

  // AC-44.
  test('a double click on Save creates one record', async ({ page }) => {
    const ticket = await createTicketFor(REQUESTER, 'AC-44 double click')
    await signInAsUser(page, STAFF)
    await openStaffTicket(page, ticket)
    await card(page).getByRole('button', { name: 'Add' }).click()
    const form = page.getByRole('form', { name: 'Add action' })
    await form.getByLabel('Description').fill('Only once')
    await form.getByRole('button', { name: 'Save' }).dblclick()

    await expect(page.getByText('Action added.')).toBeVisible()
    expect(await actionsOf(STAFF, ticket)).toHaveLength(1)
  })

  // ui-spec.md §8.7.
  test('a Finished Ticket offers no change, and its rows still open', async ({ page }) => {
    const ticket = await createTicketFor(REQUESTER, 'Finished Ticket')
    await addActionFor(STAFF, ticket, { description: 'Left Planned' })
    const api = await apiSessionFor(E2E_USERS.ADMINISTRATOR)
    const cancelled = await api.post(`/api/staff/tickets/${ticket.id}/status`, {
      data: { status: 'CANCELLED', expectedStatus: 'NEW' },
    })
    expect(cancelled.status()).toBe(200)
    await api.dispose()

    await signInAsUser(page, STAFF)
    await openStaffTicket(page, ticket)
    await expect(card(page).getByText('This ticket is cancelled. Its actions can no longer be changed.')).toBeVisible()
    await expect(card(page).getByRole('button', { name: 'Add' })).toHaveCount(0)
    await expect(rowOf(page, 'Left Planned').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await card(page).getByRole('button', { name: 'Left Planned' }).click()
    await expect(card(page).getByRole('region', { name: 'Details of Left Planned' })).toBeVisible()
  })
})
