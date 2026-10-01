import type { Page } from '@playwright/test'
import { E2E_USERS, type Role } from './users'

// Signs in through the Login screen (ui-spec.md §5), the only way an E2E
// test establishes identity, and waits for the role's landing screen.
export async function signInAs(page: Page, role: Role) {
  const user = E2E_USERS[role]

  await page.goto('/login')
  await page.getByLabel('Email address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(`**${user.landingPath}`)

  return user
}
