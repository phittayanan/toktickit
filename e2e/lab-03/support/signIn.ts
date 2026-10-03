import { expect, type Page } from '@playwright/test'
import { E2E_USERS, type E2EUser, type Role } from './users'

// Fills and submits the Login screen (ui-spec.md §5) without expecting any
// particular outcome, for the flows where the sign-in is refused or leads
// to Change Password.
export async function submitLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

// Signs the given user in through the Login screen and waits for their
// role's landing screen.
export async function signInAsUser(page: Page, user: E2EUser) {
  await page.goto('/login')
  await submitLogin(page, user.email, user.password)
  await page.waitForURL(`**${user.landingPath}`)

  return user
}

// Signs in through the Login screen (ui-spec.md §5), the only way an E2E
// test establishes identity, and waits for the role's landing screen.
export async function signInAs(page: Page, role: Role) {
  return signInAsUser(page, E2E_USERS[role])
}

// The user menu button in the shell header (ui-spec.md §4.1). It is looked
// for in the header only: User Management has an "Edit (name)" button for
// the signed-in Administrator's own row.
export function userMenuButton(page: Page, user: E2EUser) {
  return page.getByRole('banner').getByRole('button', { name: new RegExp(user.name) })
}

// Logs out from the user menu (ui-spec.md §4.3) and waits for Login.
export async function logOut(page: Page, user: E2EUser) {
  await userMenuButton(page, user).click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
}
