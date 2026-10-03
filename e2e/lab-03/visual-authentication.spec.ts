import { expect, test } from '@playwright/test'
import { signInAsUser, submitLogin } from './support/signIn'
import { E2E_USERS, createDisposableUser } from './support/users'
import { BREAKPOINTS, takeScreenshot } from './support/screenshots'
import { TOKENS, tabTo } from './support/visualData'

// VIS-01 (docs/lab-03/tests.md): Login and Change Password at desktop,
// tablet, and mobile, plus the states the ui-spec.md §13 checklist is
// judged by: field validation, keyboard focus, a refused sign-in, a
// failure, and the mandatory change.
test.describe('visual: Login', () => {
  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
      // Muted text is the Neutral token, not Bootstrap's grey.
      await expect(page.getByText('Forgot your password? Contact an administrator.')).toHaveCSS(
        'color',
        TOKENS.neutralText,
      )
      await takeScreenshot(page, 'authentication', `login-${name}`)
    })

    test(`field validation at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/login')
      await page.getByRole('button', { name: 'Sign In' }).click()
      await expect(page.getByText('Enter your email address.')).toBeVisible()
      await expect(page.getByText('Enter your password.')).toBeVisible()

      // The first invalid field takes focus, and stays in the Error colour.
      const email = page.getByLabel('Email address')
      await expect(email).toBeFocused()
      await expect(email).toHaveCSS('border-color', TOKENS.error)
      await expect(email).toHaveCSS('background-image', /b3261e/)
      await takeScreenshot(page, 'authentication', `login-${name}-validation`)
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/login')
      const email = page.getByLabel('Email address')
      await tabTo(page, email)
      await expect(email).toHaveCSS('border-color', TOKENS.secondaryGreen)
      await tabTo(page, page.getByRole('button', { name: 'Sign In' }))
      await takeScreenshot(page, 'authentication', `login-${name}-focus`, { viewportOnly: true })
    })
  }

  test('refused sign-in at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await page.goto('/login')
    // An address no account has, new on every run: the sign-in throttle
    // counts failures per email.
    await page.getByLabel('Email address').fill(`e2e.nobody.${Date.now().toString(36)}@kmutt.ac.th`)
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
    await takeScreenshot(page, 'authentication', 'login-mobile-invalid-credentials')
  })

  test('failure at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await page.route('**/api/auth/login', (route) => route.abort())
    await page.goto('/login')
    await page.getByLabel('Email address').fill(E2E_USERS.REQUESTER.email)
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await takeScreenshot(page, 'authentication', 'login-desktop-failure')
  })
})

test.describe('visual: Change Password', () => {
  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.REQUESTER)
      await page.goto('/change-password')
      await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible()
      await takeScreenshot(page, 'authentication', `change-password-${name}`)
    })

    test(`field validation at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.REQUESTER)
      await page.goto('/change-password')
      // Meets two of the four rules, and is refused in the browser, so the
      // password is never changed.
      await page.getByLabel('New password', { exact: true }).fill('Short1')
      await page.getByLabel('Confirm new password', { exact: true }).fill('different')
      await page.getByRole('button', { name: 'Change Password' }).click()
      await expect(page.getByText('Current password is required.')).toBeVisible()
      await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
      await expect(page.getByText('Confirmation does not match the new password.')).toBeVisible()
      await expect(page.getByLabel('Current password', { exact: true })).toHaveCSS('border-color', TOKENS.error)
      await takeScreenshot(page, 'authentication', `change-password-${name}-validation`)
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await signInAsUser(page, E2E_USERS.REQUESTER)
      await page.goto('/change-password')
      const newPassword = page.getByLabel('New password', { exact: true })
      await tabTo(page, newPassword)
      await expect(newPassword).toHaveCSS('border-color', TOKENS.secondaryGreen)
      await takeScreenshot(page, 'authentication', `change-password-${name}-focus`, { viewportOnly: true })
    })
  }

  for (const name of ['desktop', 'mobile'] as const) {
    test(`mandatory change at ${name}`, async ({ page }) => {
      await page.setViewportSize(BREAKPOINTS[name])
      // Still holds an Initial Password, so signing in leads here
      // (ui-spec.md §6). The change is never completed.
      const user = createDisposableUser('REQUESTER', { mustChangePassword: true })
      await page.goto('/login')
      await submitLogin(page, user.email, user.password)
      await page.waitForURL('**/change-password')
      await expect(page.getByText('You must change your password to continue.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Logout' })).toHaveCSS('border-color', TOKENS.surface)
      await takeScreenshot(page, 'authentication', `change-password-${name}-mandatory`)
    })
  }

  test('failure at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.goto('/change-password')
    await page.route('**/api/auth/change-password', (route) => route.abort())
    // Not the current password, so nothing could change even if the
    // request were sent.
    await page.getByLabel('Current password', { exact: true }).fill('Not-The-Passw0rd!')
    await page.getByLabel('New password', { exact: true }).fill('Another-Passw0rd!')
    await page.getByLabel('Confirm new password', { exact: true }).fill('Another-Passw0rd!')
    await page.getByRole('button', { name: 'Change Password' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await takeScreenshot(page, 'authentication', 'change-password-desktop-failure')
  })
})
