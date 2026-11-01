import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { apiSessionFor } from '../lab-03/support/api'
import { signInAs, signInAsUser } from '../lab-03/support/signIn'
import { E2E_USERS, createDisposableUser, type Role } from '../lab-03/support/users'
import { card, openStaffTicket } from './support/actionsTaken'

const FIXTURE = path.join(__dirname, '..', 'lab-02', 'fixtures', 'attachment.png')
const PLACEHOLDER_TEXT = /lorem ipsum|coming soon|not implemented|under construction|\bTODO\b|\bFIXME\b|\bTBD\b/i

// Screens of the same shape are visited this many times, whichever links
// reach them, so the crawl covers every shape and stays bounded.
const VISITS_PER_SHAPE = 2

const START_PATHS: Record<Role, string[]> = {
  REQUESTER: ['/dashboard', '/tickets', '/tickets/new', '/change-password'],
  IT_STAFF: ['/staff/dashboard', '/staff/queue', '/change-password'],
  ADMINISTRATOR: ['/staff/dashboard', '/staff/queue', '/admin/users', '/change-password'],
}

function shapeOf(target: string): string {
  const url = new URL(target, 'http://app')
  return url.pathname.replace(/\d+/g, ':id') + (url.search ? `?${[...url.searchParams.keys()].sort().join()}` : '') + url.hash
}

// E2E-13 (docs/lab-04/tests.md; AC-49): every screen of every role, following
// each link, with a console listener.
for (const role of Object.keys(START_PATHS) as Role[]) {
  test(`E2E-13 every ${role} screen and link is free of console errors and placeholders`, async ({ page }) => {
    test.setTimeout(240_000)
    await signInAs(page, role)

    const problems: string[] = []
    let current = ''
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${current}: console error: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`${current}: uncaught: ${error.message}`))

    const queue = [...START_PATHS[role]]
    const visited = new Set<string>()
    const shapes = new Map<string, number>()

    while (queue.length > 0) {
      const target = queue.shift()!
      const shape = shapeOf(target)
      if (visited.has(target) || (shapes.get(shape) ?? 0) >= VISITS_PER_SHAPE) continue
      visited.add(target)
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
      current = target

      await page.goto(target)
      await expect(page.locator('h1').first(), `${target} shows a screen`).toBeVisible()
      await page.waitForLoadState('networkidle')

      const heading = (await page.locator('h1').first().innerText()).trim()
      if (/not found|couldn't find|don't have access/i.test(heading)) problems.push(`${target}: broken link: "${heading}"`)
      const text = await page.locator('body').innerText()
      const placeholder = text.match(PLACEHOLDER_TEXT)
      if (placeholder) problems.push(`${target}: placeholder text: "${placeholder[0]}"`)

      const hash = new URL(target, 'http://app').hash
      if (hash && (await page.locator(hash).count()) === 0) problems.push(`${target}: dead anchor`)

      const links = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.map((anchor) => {
          const url = new URL((anchor as HTMLAnchorElement).href)
          return { sameOrigin: url.origin === location.origin, target: url.pathname + url.search + url.hash }
        }),
      )
      for (const link of links) {
        if (link.sameOrigin) queue.push(link.target)
        else problems.push(`${target}: leaves the application: ${link.target}`)
      }
    }

    expect(visited.size, 'screens visited').toBeGreaterThan(START_PATHS[role].length)
    expect(problems).toEqual([])
  })
}

test('E2E-13 Login, Not Found, and Forbidden are free of console errors', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    // The browser's own line for the session check: with no session,
    // GET /api/auth/me answers 401 by contract, and the app shows Login.
    const sessionCheck = message.location().url.endsWith('/api/auth/me') && message.text().includes('401')
    if (message.type() === 'error' && !sessionCheck) problems.push(`console error: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
  await signInAs(page, 'REQUESTER')
  await page.goto('/no-such-screen')
  await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { level: 1, name: "You don't have access to this page" })).toBeVisible()

  expect(problems).toEqual([])
})

function operations(page: Page): Locator {
  return page.getByRole('region', { name: 'Manage this ticket' })
}

async function chooseStatus(page: Page, label: string) {
  await operations(page).getByLabel('Current Status').selectOption({ label })
  await operations(page).getByRole('button', { name: 'Update Status' }).click()
}

// E2E-14 (AC-42): one journey through every earlier function, alongside the
// Lab 4 ones, in the sessions of all three roles.
test('E2E-14 one Ticket from sign-in to Closed, then user administration', async ({ browser }) => {
  test.slow()
  const tag = Date.now()
  const summary = `E2E-14 journey ${tag}`
  const comment = 'The monitor flickers again this morning.'
  const note = 'Same batch as the monitors in room 310.'
  const action = 'Replaced the display cable.'
  const resolution = 'The new cable stopped the flicker.'

  const requesterContext = await browser.newContext()
  const staffContext = await browser.newContext()
  const adminContext = await browser.newContext()
  const requester = await requesterContext.newPage()
  const staffPage = await staffContext.newPage()
  const admin = await adminContext.newPage()

  // Requester: Dashboard first, then a Ticket with an Attachment, and a comment.
  await signInAs(requester, 'REQUESTER')
  await expect(requester.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  const primary = requester.getByRole('navigation', { name: 'Primary' })
  await primary.getByRole('button', { name: 'Create Ticket' }).click()
  await expect(requester.getByRole('heading', { level: 1, name: 'Create Ticket' })).toBeVisible()
  await requester.getByLabel('Category').selectOption({ index: 1 })
  await requester.getByLabel('Related System').selectOption({ index: 1 })
  await requester.getByLabel('Requested Priority').selectOption({ label: 'Medium' })
  await requester.getByLabel('Summary').fill(summary)
  await requester.getByLabel('Description').fill('Created by E2E-14.')
  await requester.getByLabel('Attachments').setInputFiles({
    name: 'attachment.png',
    mimeType: 'image/png',
    buffer: readFileSync(FIXTURE),
  })
  const [created] = await Promise.all([
    requester.waitForResponse((res) => res.url().endsWith('/api/tickets') && res.request().method() === 'POST'),
    requester.getByRole('button', { name: 'Submit' }).click(),
  ])
  const ticket = (await created.json()) as { id: number; ticketNumber: string }
  await expect(requester.getByText('1 of 1 attachments uploaded')).toBeVisible()

  await requester.goto(`/tickets/${ticket.id}`)
  await expect(requester.getByRole('heading', { level: 1, name: ticket.ticketNumber })).toBeVisible()
  await expect(requester.getByText('attachment.png').first()).toBeVisible()
  await requester.getByLabel('Add a comment').fill(comment)
  await requester.getByRole('button', { name: 'Post Comment' }).click()
  await expect(requester.getByRole('status').filter({ hasText: 'Comment posted' })).toBeVisible()

  // IT Staff: claim, start, add a note and an Action Taken.
  await signInAsUser(staffPage, E2E_USERS.IT_STAFF)
  await expect(staffPage.getByRole('link', { name: /^Unassigned: \d+$/ })).toBeVisible()
  await openStaffTicket(staffPage, { ...ticket, summary } as Parameters<typeof openStaffTicket>[1])
  await expect(staffPage.getByText(comment)).toBeVisible()
  await operations(staffPage).getByRole('button', { name: 'Claim' }).click()
  await expect(
    operations(staffPage).getByRole('status').filter({ hasText: 'Owner updated. Status changed to Open.' }),
  ).toBeVisible()
  await chooseStatus(staffPage, 'In Progress')
  await expect(operations(staffPage).getByRole('status').filter({ hasText: 'Status changed to In Progress.' })).toBeVisible()

  await staffPage.getByRole('tab', { name: /Internal Notes/ }).click()
  const notes = staffPage.getByRole('tabpanel', { name: /Internal Notes/ })
  await notes.getByLabel('Add an internal note').fill(note)
  await notes.getByRole('button', { name: 'Add Internal Note' }).click()
  await expect(notes.getByRole('status').filter({ hasText: 'Internal note added' })).toBeVisible()

  await expect(operations(staffPage).getByRole('option', { name: 'Resolved (not available)' })).toBeDisabled()
  await card(staffPage).getByRole('button', { name: 'Add' }).click()
  const form = staffPage.getByRole('form', { name: 'Add action' })
  await form.getByLabel('Description').fill(action)
  await form.getByLabel('Status').selectOption({ label: 'Done' })
  await form.getByLabel('Result').fill('The flicker is gone.')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(card(staffPage).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()

  // Resolve and close, now that the gate is met.
  await chooseStatus(staffPage, 'Resolved')
  const resolveDialog = staffPage.getByRole('dialog', { name: `Resolve ${ticket.ticketNumber}` })
  await resolveDialog.getByLabel('Resolution Summary').fill(resolution)
  await resolveDialog.getByRole('button', { name: 'Mark as Resolved' }).click()
  await expect(operations(staffPage).getByRole('status').filter({ hasText: 'Status changed to Resolved.' })).toBeVisible()
  await chooseStatus(staffPage, 'Closed')
  await staffPage.getByRole('dialog', { name: 'Close ticket?' }).getByRole('button', { name: 'Close Ticket' }).click()
  await expect(staffPage.getByRole('group', { name: 'Ticket status' })).toHaveText('Closed')

  // Requester: reads all of it; never the note.
  await requester.reload()
  await expect(requester.getByText(resolution)).toBeVisible()
  await expect(requester.getByRole('button', { name: action })).toBeVisible()
  await expect(requester.getByText(note)).toHaveCount(0)

  // Administrator: User Management still works, from the Dashboard.
  const disposable = createDisposableUser('REQUESTER')
  await signInAs(admin, 'ADMINISTRATOR')
  await admin.getByRole('link', { name: /^Requesters?: \d+$/ }).click()
  await expect(admin.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
  await admin.getByLabel('Search users').fill(disposable.email)
  await admin.getByRole('button', { name: `Edit ${disposable.name}` }).click()
  const panel = admin.getByRole('region', { name: 'Edit User' })
  await expect(panel.getByLabel('Email Address')).toHaveValue(disposable.email)

  const api = await apiSessionFor(E2E_USERS.ADMINISTRATOR)
  expect((await api.get('/api/admin/dashboard')).status()).toBe(200)
  await api.dispose()

  await requesterContext.close()
  await staffContext.close()
  await adminContext.close()
})
