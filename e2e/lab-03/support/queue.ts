import { expect, type Page } from '@playwright/test'

// Opens the Ticket Queue from the shell navigation and waits for it. A
// step taken before the queue is on screen would act on the screen the
// user came from.
export async function openTicketQueue(page: Page) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Ticket Queue' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ticket Queue' })).toBeVisible()
}

// Types into the queue's Search and waits until it is applied: the queue
// applies it 300ms after typing stops (ui-spec.md §8.2), and a step taken
// before that would be undone when the search returns the view to page 1.
export async function searchQueue(page: Page, text: string) {
  await page.getByLabel('Search', { exact: true }).fill(text)
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(text)
}
