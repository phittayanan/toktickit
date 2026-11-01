import { test, expect, type Response } from '@playwright/test'
import { API_URL } from './support/api'
import { logOut, signInAs, signInAsUser, submitLogin, userMenuButton } from './support/signIn'
import { E2E_USERS, createDisposableUser, type Role } from './support/users'

const LOGIN_HEADING = 'Sign in to your account'
const INVALID_CREDENTIALS = 'Invalid email or password.'

// ui-spec.md §4.1: each role's navigation entries and landing screen.
const SHELL: Record<Role, { navigation: string[]; landingHeading: string; roleLabel: string }> = {
  REQUESTER: { navigation: ['Dashboard', 'My Tickets', 'Create Ticket'], landingHeading: 'Dashboard', roleLabel: 'Requester' },
  IT_STAFF: { navigation: ['Dashboard', 'Ticket Queue'], landingHeading: 'Dashboard', roleLabel: 'IT Staff' },
  ADMINISTRATOR: {
    navigation: ['Dashboard', 'Ticket Queue', 'User Management'],
    landingHeading: 'Dashboard',
    roleLabel: 'Administrator',
  },
}

// E2E-01 (docs/lab-03/tests.md; AC-01, AC-10, AC-14): each role signs in,
// sees its own navigation and nothing else, logs out, then opens a
// protected path and presses Back. Login is shown each time and no
// protected data is fetched once the session is gone.
for (const role of Object.keys(SHELL) as Role[]) {
  test(`E2E-01 ${SHELL[role].roleLabel} signs in, sees only its navigation, and logs out`, async ({ page }) => {
    const shell = SHELL[role]
    const user = await signInAs(page, role)

    await expect(page.getByRole('heading', { level: 1, name: shell.landingHeading })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button')).toHaveText(shell.navigation)
    // The user menu button shows the name and the role badge.
    await expect(userMenuButton(page, user)).toHaveText(new RegExp(`${user.name}\\s*${shell.roleLabel}`))

    await logOut(page, user)
    await expect(page).toHaveURL(/\/login$/)

    // From here on the session is gone: any API answer other than a refusal
    // would mean protected data reached the browser.
    const answeredWithData: string[] = []
    const recordProtectedData = (response: Response) => {
      const url = response.url()
      if (url.startsWith(`${API_URL}/api/`) && !url.includes('/api/auth/') && response.ok()) answeredWithData.push(url)
    }
    page.on('response', recordProtectedData)

    await page.goto(user.landingPath)
    await expect(page.getByRole('heading', { name: LOGIN_HEADING })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    await page.goBack()
    await expect(page.getByRole('heading', { name: LOGIN_HEADING })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: shell.landingHeading })).toHaveCount(0)
    expect(answeredWithData).toEqual([])
  })
}

// E2E-02 (AC-02, AC-09): a user with an initial password reaches nothing
// but Change Password until a valid new password is saved; afterwards the
// new password signs in and the initial one does not.
test('E2E-02 an initial password must be changed before the application opens', async ({ page }) => {
  const user = createDisposableUser('REQUESTER', { mustChangePassword: true })
  const newPassword = 'Changed-Passw0rd!'

  await page.goto('/login')
  await submitLogin(page, user.email, user.password)

  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Change Password' })).toBeVisible()
  await expect(page.getByText('You must change your password to continue.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)

  // A normal screen stays out of reach while the change is outstanding.
  await page.goto('/tickets')
  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByRole('heading', { level: 1, name: 'My Tickets' })).toHaveCount(0)

  // A password that breaks BR-08 is refused and changes nothing.
  await page.getByLabel('Current (temporary) password', { exact: true }).fill(user.password)
  await page.getByLabel('New password', { exact: true }).fill('short')
  await page.getByLabel('Confirm new password', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
  await expect(page).toHaveURL(/\/change-password$/)

  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('status').filter({ hasText: 'Password changed.' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button')).toHaveText(
    SHELL.REQUESTER.navigation,
  )

  await logOut(page, user)
  await submitLogin(page, user.email, user.password)
  await expect(page.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()

  await submitLogin(page, user.email, newPassword)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
})

// E2E-03 (AC-05, AC-06, AC-07): the three refusals of Login.
test.describe('E2E-03 refused sign-in', () => {
  test('a wrong password gets the generic message and keeps the email', async ({ page }) => {
    const user = createDisposableUser('REQUESTER')

    await page.goto('/login')
    await submitLogin(page, user.email, 'Wrong-Passw0rd!')

    await expect(page.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Email address')).toHaveValue(user.email)
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  })

  test('an inactive account is told so only with the correct password', async ({ page }) => {
    const user = createDisposableUser('REQUESTER', { isActive: false })

    await page.goto('/login')
    await submitLogin(page, user.email, 'Wrong-Passw0rd!')
    await expect(page.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()

    await submitLogin(page, user.email, user.password)
    await expect(
      page.getByRole('alert').filter({ hasText: 'This account is inactive. Contact an administrator.' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('five failures in a row refuse even the correct password', async ({ page }) => {
    const user = createDisposableUser('REQUESTER')

    await page.goto('/login')
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      // Each refusal clears the password, which is how the next attempt
      // knows the previous answer has arrived.
      await submitLogin(page, user.email, `Wrong-Passw0rd-${attempt}!`)
      await expect(page.getByRole('alert').filter({ hasText: INVALID_CREDENTIALS })).toBeVisible()
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    }

    await submitLogin(page, user.email, user.password)
    await expect(
      page.getByRole('alert').filter({ hasText: 'Too many failed sign-in attempts. Try again later.' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  })
})

// E2E-04 (AC-13): after login nothing a script can read holds the session
// or the identity, and the Lab 2 selector's storage key is gone.
test('E2E-04 no session value or identity is readable by script after login', async ({ page, context }) => {
  const user = await signInAsUser(page, E2E_USERS.REQUESTER)

  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === 'tk_session')
  expect(sessionCookie, 'the tk_session cookie').toBeDefined()
  expect(sessionCookie?.httpOnly).toBe(true)
  expect(sessionCookie?.sameSite).toBe('Strict')

  const readable = await page.evaluate(() => ({
    cookie: document.cookie,
    localStorage: JSON.stringify({ ...window.localStorage }),
    sessionStorage: JSON.stringify({ ...window.sessionStorage }),
    legacyRequester: window.localStorage.getItem('toktickit.requester'),
  }))

  // Compared as booleans so that a failure never prints the session value.
  const sessionValue = sessionCookie?.value ?? ''
  for (const [place, content] of [
    ['document.cookie', readable.cookie],
    ['localStorage', readable.localStorage],
    ['sessionStorage', readable.sessionStorage],
  ]) {
    expect(content.includes('tk_session'), `${place} names the session cookie`).toBe(false)
    expect(content.includes(sessionValue), `${place} holds the session value`).toBe(false)
    expect(content.includes(user.email), `${place} holds the user's email`).toBe(false)
    expect(content.includes(user.name), `${place} holds the user's name`).toBe(false)
  }
  expect(readable.legacyRequester).toBeNull()
})
