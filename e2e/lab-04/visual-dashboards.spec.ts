import { expect, test, type Page } from '@playwright/test'
import { apiSessionFor, createTicketFor, startWorkOn } from '../lab-03/support/api'
import { BREAKPOINTS } from '../lab-03/support/screenshots'
import { signInAsUser } from '../lab-03/support/signIn'
import { createDisposableUser, E2E_USERS, type E2EUser } from '../lab-03/support/users'

// VIS-01 and VIS-02 (docs/lab-04/tests.md): the dashboards at desktop,
// tablet, and mobile, plus empty and failure, stored under the folders of
// ui-spec.md §14 and judged against its §13 checklist.
const LONG_SUMMARY =
  'Cannot connect to the campus VPN from the engineering building laboratory computers since the certificate renewal'
const SCREENSHOTS = 'artifacts/lab-04/screenshots'

async function capture(page: Page, folder: string, name: string) {
  const pageWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  )
  expect(pageWidth, 'no horizontal page scroll').toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({ path: `${SCREENSHOTS}/${folder}/${name}.png`, fullPage: true })
}

// A state's desktop picture keeps its plain name; the others say their width.
const stateAt = (state: string, width: string) => (width === 'desktop' ? state : `${state}-${width}`)

async function openDashboard(page: Page, user: E2EUser, ready: RegExp) {
  await signInAsUser(page, user)
  await expect(page.getByRole('link', { name: ready })).toBeVisible()
}

const EMPTY_STAFF = {
  unassignedCount: 0,
  ownedByMeCount: 0,
  myPlannedActionsTakenCount: 0,
  byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, REOPENED: 0 },
  byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  myPlannedActionsTaken: [],
  urgent: [],
  recentlyUpdated: [],
}

test.describe('visual: Requester Dashboard', () => {
  test.describe.configure({ mode: 'default' })

  let requester: ReturnType<typeof createDisposableUser>

  test.beforeAll(async () => {
    requester = createDisposableUser('REQUESTER')
    await createTicketFor(requester, LONG_SUMMARY)
    await createTicketFor(requester, 'Laptop battery drains quickly')
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openDashboard(page, requester, /^Open Tickets: \d+$/)

      await capture(page, 'requester-dashboard', name)
    })
  }

  test('lays the cards out as ui-spec.md §5.3 says', async ({ page }) => {
    const top = async (label: RegExp) => (await page.getByRole('link', { name: label }).boundingBox())!.y

    await page.setViewportSize(BREAKPOINTS.tablet)
    await openDashboard(page, requester, /^Open Tickets: \d+$/)
    expect(await top(/^Open Tickets/)).toBe(await top(/^Waiting for Requester/))

    await page.setViewportSize(BREAKPOINTS.mobile)
    expect(await top(/^Open Tickets/)).toBeLessThan(await top(/^Waiting for Requester/))
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`shows the empty state at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openDashboard(page, createDisposableUser('REQUESTER'), /^Open Tickets: 0$/)

      await expect(page.getByText('No tickets updated in the last 7 days.')).toBeVisible()
      await expect(page.getByText('No tickets resolved in the last 7 days.')).toBeVisible()
      await capture(page, 'requester-dashboard', stateAt('empty', name))
    })

    test(`shows the failure state at ${name}, and Retry recovers`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.route('**/api/requester/dashboard', (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
      await signInAsUser(page, requester)
      await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.')
      await capture(page, 'requester-dashboard', stateAt('failure', name))

      await page.unroute('**/api/requester/dashboard')
      await page.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByRole('link', { name: /^Open Tickets: \d+$/ })).toBeVisible()
    })
  }
})

test.describe('visual: IT Staff and Administrator dashboards', () => {
  test.describe.configure({ mode: 'default' })

  test.beforeAll(async () => {
    const staff = { ...E2E_USERS.IT_STAFF, id: 0 }
    const api = await apiSessionFor(E2E_USERS.IT_STAFF)
    const me = await (await api.get('/api/auth/me')).json()
    await api.dispose()
    await startWorkOn({ ...staff, id: me.id }, await createTicketFor(E2E_USERS.REQUESTER, LONG_SUMMARY))
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`IT Staff renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openDashboard(page, E2E_USERS.IT_STAFF, /^Unassigned: \d+$/)

      await capture(page, 'staff-dashboard', `it-staff-${name}`)
    })

    test(`Administrator renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openDashboard(page, E2E_USERS.ADMINISTRATOR, /^Requesters: \d+$/)
      await expect(page.getByRole('link', { name: /^Unassigned: \d+$/ })).toBeVisible()

      await capture(page, 'staff-dashboard', `administrator-${name}`)
    })
  }

  test('lays the cards and tables out as ui-spec.md §6.3 says', async ({ page }) => {
    const box = async (label: RegExp) => (await page.getByRole('link', { name: label }).boundingBox())!

    await page.setViewportSize(BREAKPOINTS.tablet)
    await openDashboard(page, E2E_USERS.IT_STAFF, /^Unassigned: \d+$/)
    expect((await box(/^Unassigned/)).y).toBe((await box(/^My Planned Actions Taken/)).y)
    const tablesAt = async (title: string) => (await page.getByRole('region', { name: title }).boundingBox())!.y
    expect(await tablesAt('By status')).toBe(await tablesAt('By IT Priority'))

    await page.setViewportSize(BREAKPOINTS.mobile)
    expect((await box(/^Unassigned/)).y).toBeLessThan((await box(/^Owned by me/)).y)
    expect(await tablesAt('By status')).toBeLessThan(await tablesAt('By IT Priority'))
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`shows the empty state at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.route('**/api/staff/dashboard', (route) => route.fulfill({ json: EMPTY_STAFF }))
      await openDashboard(page, E2E_USERS.IT_STAFF, /^Unassigned: 0$/)

      await expect(page.getByText('No planned actions assigned to you.')).toBeVisible()
      await expect(page.getByText('No urgent tickets.')).toBeVisible()
      await capture(page, 'staff-dashboard', stateAt('empty', name))
    })

    test(`shows the failure state at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.route('**/api/staff/dashboard', (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
      await signInAsUser(page, E2E_USERS.IT_STAFF)

      await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.')
      await capture(page, 'staff-dashboard', stateAt('failure', name))
    })
  }

  test('keeps the rest usable when Active accounts fails', async ({ page }) => {
    await page.route('**/api/admin/dashboard', (route) => route.fulfill({ status: 500, json: { error: 'x' } }))
    await signInAsUser(page, E2E_USERS.ADMINISTRATOR)

    const section = page.getByRole('region', { name: 'Active accounts' })
    await expect(section.getByRole('alert')).toContainText('Something went wrong. Please try again.')
    await expect(page.getByRole('link', { name: /^Unassigned: \d+$/ })).toBeVisible()
    await capture(page, 'staff-dashboard', 'administrator-accounts-failure')
  })
})
