import { expect, test, type Page } from '@playwright/test'
import { signInAsUser } from './support/signIn'
import { E2E_USERS } from './support/users'
import { BREAKPOINTS, takeScreenshot } from './support/screenshots'
import { TOKENS, ensureLongNamedUser, expectFocusKept, holdRequests, openUserMenu, tabTo } from './support/visualData'

// VIS-05 (docs/lab-03/tests.md): User Management at desktop, tablet, and
// mobile, plus the create panel and the one-time password dialog, and the
// other states the ui-spec.md §13 checklist is judged by: the open menu,
// keyboard focus, the read-only parts of the edit panel, no-results,
// conflict, loading, failure, and forbidden.
const USERS_REQUEST = /\/api\/admin\/users(\?.*)?$/

test.describe('visual: User Management', () => {
  test.beforeAll(() => {
    ensureLongNamedUser()
  })

  async function openUsers(page: Page) {
    await signInAsUser(page, E2E_USERS.ADMINISTRATOR)
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Edit ${E2E_USERS.IT_STAFF.name}` }).locator('visible=true'),
    ).toBeVisible()
  }

  // Below 992px the panel is a dialog (ui-spec.md §10.3).
  function isDialog(name: string) {
    return name !== 'desktop'
  }

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    test(`renders cleanly at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      // Table text is the Text token, not Bootstrap's black.
      await expect(page.locator('.tk-users__table td').first()).toHaveCSS('color', TOKENS.text)
      await takeScreenshot(page, 'user-management', name)
    })

    test(`menu at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      await openUserMenu(page, E2E_USERS.ADMINISTRATOR, 'Administrator')
      await takeScreenshot(page, 'user-management', `${name}-menu`, { viewportOnly: true })
    })

    test(`keyboard focus at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      await tabTo(page, page.getByRole('button', { name: 'Create User' }))
      await takeScreenshot(page, 'user-management', `${name}-focus`, { viewportOnly: true })
    })

    test(`create panel at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      await page.getByRole('button', { name: 'Create User' }).click()
      await expect(page.getByRole('heading', { name: 'Create New User' })).toBeVisible()
      if (isDialog(name)) await expectFocusKept(page, page.getByRole('dialog', { name: 'Create New User' }))

      // Saved empty, so the validation messages are in the picture.
      await page.getByRole('button', { name: 'Save User' }).click()
      await expect(page.getByLabel('Full Name')).toHaveAttribute('aria-invalid', 'true')
      await takeScreenshot(page, 'user-management', `${name}-create-panel`, { viewportOnly: isDialog(name) })
    })

    test(`one-time password dialog at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      const fullName = `E2E Visual Created ${name}`
      await page.getByRole('button', { name: 'Create User' }).click()
      await page.getByLabel('Full Name').fill(fullName)
      await page.getByLabel('Email Address').fill(`e2e.new.${Date.now().toString(36)}@kmutt.ac.th`)
      await page.getByRole('combobox', { name: 'Role' }).last().selectOption({ label: 'IT Staff' })
      await page.getByRole('button', { name: 'Save User' }).click()

      const dialog = page.getByRole('dialog', { name: `Temporary password for ${fullName}` })
      const password = dialog.getByLabel('Temporary password')
      await expect(password).toHaveValue(/\S/)
      await expectFocusKept(page, dialog)
      // The generated Initial Password is covered: no password is stored in
      // a committed image.
      await takeScreenshot(page, 'user-management', `${name}-one-time-password`, {
        mask: [password],
        viewportOnly: true,
      })
    })

    test(`no-results state at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      await page.getByRole('searchbox', { name: 'Search users' }).fill('no-such-user-xyz')
      await expect(page.getByText('No users match your search or filter.')).toBeVisible()
      await takeScreenshot(page, 'user-management', `${name}-no-results`)
    })

    // Editing their own account, an Administrator cannot deactivate it: the
    // Active switch is read-only, with the reason beside it.
    test(`edit own account at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await openUsers(page)
      await page
        .getByRole('button', { name: `Edit ${E2E_USERS.ADMINISTRATOR.name}` })
        .locator('visible=true')
        .click()
      await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible()
      await expect(page.getByText('You cannot deactivate your own account.')).toBeVisible()
      await expect(page.getByRole('switch', { name: /Active/ })).toBeDisabled()
      await takeScreenshot(page, 'user-management', `${name}-edit-own-account`, { viewportOnly: isDialog(name) })
    })
  }

  test('conflict at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await openUsers(page)
    await page.getByRole('button', { name: 'Create User' }).click()
    await page.getByLabel('Full Name').fill('E2E Visual Duplicate')
    await page.getByLabel('Email Address').fill(E2E_USERS.REQUESTER.email)
    await page.getByRole('combobox', { name: 'Role' }).last().selectOption({ label: 'Requester' })
    await page.getByRole('button', { name: 'Save User' }).click()
    await expect(page.getByText('A user with this email already exists.')).toBeVisible()
    await takeScreenshot(page, 'user-management', 'desktop-conflict')
  })

  test('loading state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    const release = await holdRequests(page, USERS_REQUEST)
    await signInAsUser(page, E2E_USERS.ADMINISTRATOR)
    await expect(page.getByText('Loading users…')).toBeVisible()
    await expect(page.locator('.tk-users__skeleton-row .placeholder').first()).toHaveCSS(
      'background-color',
      TOKENS.readonlyBackground,
    )
    await takeScreenshot(page, 'user-management', 'desktop-loading')
    release()
  })

  test('failure state at desktop', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.desktop)
    await page.route(USERS_REQUEST, (route) => route.abort())
    await signInAsUser(page, E2E_USERS.ADMINISTRATOR)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await takeScreenshot(page, 'user-management', 'desktop-failure')
  })

  test('forbidden for IT Staff at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsUser(page, E2E_USERS.IT_STAFF)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    await takeScreenshot(page, 'user-management', 'mobile-forbidden')
  })
})
