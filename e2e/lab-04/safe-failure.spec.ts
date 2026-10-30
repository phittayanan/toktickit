import { expect, test, type Page, type Route } from '@playwright/test'
import { API_URL, createTicketFor } from '../lab-03/support/api'
import { signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS } from '../lab-03/support/users'
import { actionsOf, card, openStaffTicket } from './support/actionsTaken'

// E2E-12 (AC-45), the Actions Taken form, and AC-44: what was typed survives
// a validation error and a lost connection, and a retry makes one record.
const SAFE_FAILURE = 'Something went wrong. Please try again.'
const STAFF = E2E_USERS.IT_STAFF

const isCreate = (url: URL) => url.href.startsWith(`${API_URL}/api/`) && url.pathname.endsWith('/actions-taken')

async function openAddForm(page: Page, summary: string) {
  const ticket = await createTicketFor(E2E_USERS.REQUESTER, summary)
  await signInAsUser(page, STAFF)
  await openStaffTicket(page, ticket)
  await card(page).getByRole('button', { name: 'Add' }).click()

  return { ticket, form: page.getByRole('form', { name: 'Add action' }) }
}

test.describe('safe failure: Actions Taken form', () => {
  test('a server failure shows the safe message and keeps the typed data', async ({ page }) => {
    const { form, ticket } = await openAddForm(page, 'E2E-12 server failure')
    await page.route(isCreate, async (route: Route) => {
      const request = route.request()
      if (request.method() !== 'POST') return route.fallback()

      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': (await request.headerValue('origin')) ?? '*',
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ error: SAFE_FAILURE, code: 'INTERNAL_ERROR', stack: 'at /srv/toktickit/app.ts' }),
      })
    })
    await form.getByLabel('Description').fill('Typed before the failure')
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(form.getByText(SAFE_FAILURE)).toBeVisible()
    await expect(form.getByLabel('Description')).toHaveValue('Typed before the failure')
    expect(await page.locator('body').innerText()).not.toMatch(/INTERNAL_ERROR|\/srv\/toktickit/)
    expect(await actionsOf(STAFF, ticket)).toHaveLength(0)
  })

  test('a lost connection keeps the typed data, and Save works once it is back', async ({ page }) => {
    const { form, ticket } = await openAddForm(page, 'E2E-12 lost connection')
    const lose = (route: Route) =>
      route.request().method() === 'POST' ? route.abort('connectionrefused') : route.fallback()
    await page.route(isCreate, lose)
    await form.getByLabel('Description').fill('Typed before the failure')
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(form.getByText(SAFE_FAILURE)).toBeVisible()
    await expect(form.getByLabel('Description')).toHaveValue('Typed before the failure')

    await page.unroute(isCreate, lose)
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Action added.')).toBeVisible()
    expect(await actionsOf(STAFF, ticket)).toHaveLength(1)
  })

  test('a retry after a lost response makes one record', async ({ page }) => {
    const { form, ticket } = await openAddForm(page, 'AC-44 lost response')
    const loseResponse = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      // The API has the request; only its answer never arrives.
      await route.fetch()

      return route.abort('connectionreset')
    }
    await page.route(isCreate, loseResponse)
    await form.getByLabel('Description').fill('Saved once')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form.getByText(SAFE_FAILURE)).toBeVisible()
    expect(await actionsOf(STAFF, ticket)).toHaveLength(1)

    await page.unroute(isCreate, loseResponse)
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Action added.')).toBeVisible()
    expect(await actionsOf(STAFF, ticket)).toHaveLength(1)
  })

  test('a validation error keeps the typed data and sends nothing', async ({ page }) => {
    const { form, ticket } = await openAddForm(page, 'BR-35 validation')
    await form.getByLabel('Attachment notes').fill('See report.pdf')
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(form.getByText('Description is required.')).toBeVisible()
    await expect(form.getByLabel('Description')).toBeFocused()
    await expect(form.getByLabel('Attachment notes')).toHaveValue('See report.pdf')
    expect(await actionsOf(STAFF, ticket)).toHaveLength(0)
  })
})
