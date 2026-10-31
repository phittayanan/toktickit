import { test, expect, type Locator, type Page } from '@playwright/test'
import { apiSessionFor, apiUrl, createTicketFor } from './support/api'
import { openTicketQueue, searchQueue } from './support/queue'
import { logOut, signInAs, signInAsUser, submitLogin } from './support/signIn'
import { E2E_SECOND_REQUESTER, E2E_USERS, createDisposableUser, type E2EUser } from './support/users'

const INVALID_CREDENTIALS = 'Invalid email or password.'
// specification.md UNIT-03: four groups of four characters.
const INITIAL_PASSWORD_SHAPE = /^[^\s-]{4}(-[^\s-]{4}){3}$/

// The User Management table (ui-spec.md §10.1), in column order.
const COLUMN = { name: 0, email: 1, role: 2, status: 3 } as const

function userRows(page: Page): Locator {
  return page.getByRole('table').locator('tbody').getByRole('row')
}

function cells(page: Page, column: number): Locator {
  return userRows(page).locator(`td:nth-child(${column + 1})`)
}

function rowOf(page: Page, email: string): Locator {
  return userRows(page).filter({ hasText: email })
}

async function searchUsers(page: Page, text: string) {
  await page.getByLabel('Search users').fill(text)
}

// Opens the edit panel for the one user the search finds.
async function openEditPanel(page: Page, user: { name: string; email: string }): Promise<Locator> {
  await searchUsers(page, user.email)
  await expect(cells(page, COLUMN.email)).toHaveText([user.email])
  await page.getByRole('button', { name: `Edit ${user.name}` }).click()
  const panel = page.getByRole('region', { name: 'Edit User' })
  await expect(panel.getByLabel('Email Address')).toHaveValue(user.email)

  return panel
}

// Reads the password out of the one-time password dialog and closes it.
// The value is only ever passed on to a sign-in, never printed.
async function takeTemporaryPassword(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole('dialog', { name: `Temporary password for ${name}` })
  const password = await dialog.getByLabel('Temporary password').inputValue()
  expect(INITIAL_PASSWORD_SHAPE.test(password), 'the temporary password is four groups of four').toBe(true)
  await expect(dialog).toContainText('This password is shown only once.')

  // ui-spec.md §10.2: Escape does not close this dialog; only Done does.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)

  return password
}

// Whether the text is anywhere on the page, including in a form field,
// answered as a boolean so that a failure does not print it.
async function isShownAnywhere(page: Page, text: string): Promise<boolean> {
  return page.evaluate((needle) => {
    const fields = Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[]
    return document.body.innerText.includes(needle) || fields.some((field) => field.value.includes(needle))
  }, text)
}

// E2E-09 (AC-40 to AC-43): the Administrator's list, create, and edit, and
// the new user's first sign-in with the one-time password.
test('E2E-09 an Administrator finds, creates, and edits users, and the new user signs in', async ({
  page,
  browser,
}) => {
  test.slow()
  const tag = Date.now()
  const created = { name: `E2E Created ${tag}`, email: `e2e.created.${tag}@kmutt.ac.th` }
  const renamed = `E2E Renamed ${tag}`

  await signInAs(page, 'ADMINISTRATOR')
  await page.goto('/admin/users')
  await expect(page.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Status', 'Actions'])

  // Search by name and by email, in another letter case.
  await searchUsers(page, 'e2e it staff')
  await expect(cells(page, COLUMN.email)).toHaveText([E2E_USERS.IT_STAFF.email])
  await searchUsers(page, 'E2E.REQUESTER-2@')
  await expect(cells(page, COLUMN.email)).toHaveText([E2E_SECOND_REQUESTER.email])

  // The role filter alone, then together with the search.
  await searchUsers(page, '')
  await page.getByLabel('Role').selectOption({ label: 'Administrator' })
  await expect(rowOf(page, E2E_USERS.ADMINISTRATOR.email)).toBeVisible()
  for (const roleCell of await cells(page, COLUMN.role).all()) await expect(roleCell).toHaveText('Administrator')

  await searchUsers(page, E2E_USERS.ADMINISTRATOR.email)
  await expect(cells(page, COLUMN.email)).toHaveText([E2E_USERS.ADMINISTRATOR.email])
  await expect(cells(page, COLUMN.name)).toContainText(['(you)'])

  await page.getByLabel('Role').selectOption({ label: 'Requester' })
  await expect(page.getByText('No users match your search or filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear Filters' }).last().click()
  await expect(page.getByLabel('Search users')).toHaveValue('')
  await expect(page.getByLabel('Role')).toHaveValue('')
  await expect(rowOf(page, E2E_USERS.REQUESTER.email)).toBeVisible()

  // Create: no password is asked for; one is generated and shown once.
  await page.getByRole('button', { name: 'Create User' }).click()
  const createPanel = page.getByRole('region', { name: 'Create New User' })
  await expect(createPanel.getByLabel(/password/i)).toHaveCount(0)
  await createPanel.getByLabel('Full Name').fill(created.name)
  await createPanel.getByLabel('Email Address').fill(created.email)
  await createPanel.getByLabel('Role').selectOption({ label: 'IT Staff' })
  await createPanel.getByRole('button', { name: 'Save User' }).click()

  const temporaryPassword = await takeTemporaryPassword(page, created.name)
  await expect(page.getByRole('status').filter({ hasText: 'User created.' })).toBeVisible()
  expect(await isShownAnywhere(page, temporaryPassword), 'the temporary password is still shown').toBe(false)

  await searchUsers(page, created.email)
  await expect(cells(page, COLUMN.name)).toHaveText([created.name])
  await expect(cells(page, COLUMN.role)).toHaveText(['IT Staff'])
  await expect(cells(page, COLUMN.status)).toHaveText(['Active'])

  // The same email in another letter case is refused under the Email field.
  await page.getByRole('button', { name: 'Create User' }).click()
  await createPanel.getByLabel('Full Name').fill('E2E Duplicate')
  await createPanel.getByLabel('Email Address').fill(created.email.toUpperCase())
  await createPanel.getByLabel('Role').selectOption({ label: 'Requester' })
  await createPanel.getByRole('button', { name: 'Save User' }).click()
  await expect(createPanel.getByText('A user with this email already exists.')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(createPanel.getByLabel('Full Name')).toHaveValue('E2E Duplicate')
  await createPanel.getByRole('button', { name: 'Cancel' }).click()
  await expect(cells(page, COLUMN.email)).toHaveText([created.email])

  // Edit: the change is saved and visible in the list, and the password
  // generated earlier is not shown again.
  const editPanel = await openEditPanel(page, created)
  expect(await isShownAnywhere(page, temporaryPassword), 'the temporary password is shown in Edit User').toBe(false)
  await editPanel.getByLabel('Full Name').fill(renamed)
  await editPanel.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible()
  await expect(cells(page, COLUMN.name)).toHaveText([renamed])
  await expect(cells(page, COLUMN.email)).toHaveText([created.email])

  // The new user: the one-time password signs in, must be changed, and
  // then no longer works.
  const newUser: E2EUser = {
    name: renamed,
    email: created.email,
    password: 'Chosen-Passw0rd!',
    role: 'IT_STAFF',
    landingPath: '/staff/dashboard',
  }
  const newUserContext = await browser.newContext()
  const newUserPage = await newUserContext.newPage()
  await newUserPage.goto('/login')
  await submitLogin(newUserPage, newUser.email, temporaryPassword)
  await expect(newUserPage).toHaveURL(/\/change-password$/)
  await expect(newUserPage.getByText('You must change your password to continue.')).toBeVisible()

  await newUserPage.getByLabel('Current (temporary) password', { exact: true }).fill(temporaryPassword)
  await newUserPage.getByLabel('New password', { exact: true }).fill(newUser.password)
  await newUserPage.getByLabel('Confirm new password', { exact: true }).fill(newUser.password)
  await newUserPage.getByRole('button', { name: 'Continue' }).click()
  await expect(newUserPage).toHaveURL(/\/staff\/dashboard$/)
  await expect(newUserPage.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(newUserPage.getByRole('navigation', { name: 'Primary' }).getByRole('button')).toHaveText([
    'Dashboard',
    'Ticket Queue',
  ])

  await logOut(newUserPage, newUser)
  await submitLogin(newUserPage, newUser.email, temporaryPassword)
  await expect(newUserPage.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()
  await newUserContext.close()
})

// E2E-10 (AC-17, AC-44): a new initial password ends the user's session,
// retires their old password, and forces a change at the next sign-in.
test('E2E-10 a new initial password signs the user out and forces a change', async ({ page, browser }) => {
  const user = createDisposableUser('IT_STAFF')

  const userContext = await browser.newContext()
  const userPage = await userContext.newPage()
  await signInAsUser(userPage, user)
  await expect(userPage.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()

  await signInAs(page, 'ADMINISTRATOR')
  await page.goto('/admin/users')
  const panel = await openEditPanel(page, user)
  await panel.getByRole('button', { name: 'Set New Initial Password' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Set new initial password?' })
  await expect(confirmation).toContainText(
    `${user.name}'s current password will stop working and they will be signed out.`,
  )
  await confirmation.getByRole('button', { name: 'Set New Initial Password' }).click()
  const temporaryPassword = await takeTemporaryPassword(page, user.name)

  // The user's next request is refused and Login says why.
  await userPage.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Ticket Queue' }).click()
  await expect(userPage.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
  await expect(
    userPage.getByRole('alert').filter({ hasText: 'Your session has ended. Please sign in again.' }),
  ).toBeVisible()

  await submitLogin(userPage, user.email, user.password)
  await expect(userPage.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()

  await submitLogin(userPage, user.email, temporaryPassword)
  await expect(userPage).toHaveURL(/\/change-password$/)
  await expect(userPage.getByText('You must change your password to continue.')).toBeVisible()
  await expect(userPage.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  await userContext.close()
})

// E2E-11 (AC-45, AC-46, AC-47): the two changes an Administrator is
// refused, and what deactivating a Ticket Owner does to their Tickets.
test.describe('E2E-11 refused changes and deactivating a Ticket Owner', () => {
  test('an Administrator cannot deactivate their own account', async ({ page }) => {
    const administrator = createDisposableUser('ADMINISTRATOR')
    await signInAsUser(page, administrator)
    await page.goto('/admin/users')

    const panel = await openEditPanel(page, administrator)
    await expect(panel.getByRole('switch', { name: 'Active' })).toBeDisabled()
    await expect(panel.getByText('You cannot deactivate your own account.')).toBeVisible()
    await expect(panel.getByText('Use Change Password in the menu for your own account.')).toBeVisible()

    // The disabled switch is feedback; the backend is the control (BR-18).
    const refusal = await page.request.patch(apiUrl(`/api/admin/users/${administrator.id}`), {
      data: { isActive: false },
    })
    expect(refusal.status()).toBe(409)
    expect(await refusal.json()).toEqual({
      error: 'You cannot deactivate your own account.',
      code: 'SELF_DEACTIVATION',
    })

    await panel.getByRole('button', { name: 'Cancel' }).click()
    await page.reload()
    await searchUsers(page, administrator.email)
    await expect(cells(page, COLUMN.status)).toHaveText(['Active'])
  })

  test('the last active Administrator cannot be given another role', async ({ page }) => {
    const administrator = createDisposableUser('ADMINISTRATOR')
    await signInAsUser(page, administrator)
    await page.goto('/admin/users')

    // Make this account the only active Administrator, for the length of
    // this test only: every other one is put back afterwards.
    const others = (
      (await (await page.request.get(apiUrl('/api/admin/users?role=ADMINISTRATOR'))).json()) as {
        id: number
        isActive: boolean
      }[]
    ).filter((user) => user.isActive && user.id !== administrator.id)
    const setActive = async (isActive: boolean) => {
      for (const other of others) {
        const response = await page.request.patch(apiUrl(`/api/admin/users/${other.id}`), { data: { isActive } })
        expect(response.status(), `setting isActive=${isActive} on user ${other.id}`).toBe(200)
      }
    }

    await setActive(false)
    try {
      const panel = await openEditPanel(page, administrator)
      await panel.getByLabel('Role').selectOption({ label: 'IT Staff' })
      await panel.getByRole('button', { name: 'Save Changes' }).click()
      await page.getByRole('dialog', { name: 'Change role?' }).getByRole('button', { name: 'Change Role' }).click()

      await expect(
        panel.getByRole('alert').filter({
          hasText: 'This is the last active administrator. Make another user an administrator first.',
        }),
      ).toBeVisible()

      // Still an Administrator, still signed in.
      await panel.getByRole('button', { name: 'Cancel' }).click()
      await page.reload()
      await searchUsers(page, administrator.email)
      await expect(cells(page, COLUMN.role)).toHaveText(['Administrator'])
    } finally {
      await setActive(true)
    }
  })

  test('deactivating a Ticket Owner returns their unfinished Tickets to the queue', async ({ page }) => {
    const owner = createDisposableUser('IT_STAFF')
    const tickets = [
      await createTicketFor(E2E_USERS.REQUESTER, `E2E-11 owned ticket A ${Date.now()}`),
      await createTicketFor(E2E_USERS.REQUESTER, `E2E-11 owned ticket B ${Date.now()}`),
    ]
    const ownerApi = await apiSessionFor(owner)
    for (const ticket of tickets) {
      const claimed = await ownerApi.put(`/api/staff/tickets/${ticket.id}/owner`, {
        data: { ownerId: owner.id, expectedOwnerId: null },
      })
      expect(claimed.status(), `claiming ${ticket.ticketNumber}`).toBe(200)
    }
    await ownerApi.dispose()

    await signInAs(page, 'ADMINISTRATOR')
    await page.goto('/admin/users')
    const panel = await openEditPanel(page, owner)
    await panel.getByRole('switch', { name: 'Active' }).uncheck()
    await panel.getByRole('button', { name: 'Save Changes' }).click()

    const confirmation = page.getByRole('dialog', { name: 'Deactivate user?' })
    await expect(confirmation).toContainText(
      `${owner.name} will be signed out. 2 unfinished tickets they own will return to the queue as unassigned.`,
    )
    await confirmation.getByRole('button', { name: 'Deactivate' }).click()

    await expect(
      page.getByRole('status').filter({ hasText: 'Changes saved. 2 tickets returned to the queue as unassigned.' }),
    ).toBeVisible()
    await expect(cells(page, COLUMN.status)).toHaveText(['Inactive'])

    // The Tickets are back in the queue, unassigned, with their status kept.
    await openTicketQueue(page)
    for (const ticket of tickets) {
      await searchQueue(page, ticket.ticketNumber)
      const row = page.getByRole('table').locator('tbody').getByRole('row')
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(ticket.ticketNumber)
      await expect(row.locator('td:nth-child(6)')).toHaveText('Unassigned')
      await expect(row.locator('td:nth-child(5)')).toHaveText('Open')
    }
  })
})

// E2E-12 (AC-14, AC-15): User Management is out of an IT Staff user's reach.
test('E2E-12 IT Staff get the Forbidden page for User Management and 403 from its endpoint', async ({ page }) => {
  await signInAs(page, 'IT_STAFF')

  const adminAnswersWithData: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/admin/') && response.ok()) adminAnswersWithData.push(response.url())
  })

  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { level: 1, name: /have access to this page/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go to Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create User' })).toHaveCount(0)
  expect(adminAnswersWithData).toEqual([])

  const response = await page.request.get(apiUrl('/api/admin/users'))
  expect(response.status()).toBe(403)
  expect(await response.json()).toEqual({ error: 'You do not have permission to do this.', code: 'FORBIDDEN' })
})
