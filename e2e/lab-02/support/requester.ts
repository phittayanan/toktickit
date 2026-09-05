import type { Page } from '@playwright/test'

// Seeds the Development Requester Selector's localStorage entry directly
// (ADR-0001) so visual specs land straight on an authenticated screen
// instead of re-driving the Selector in every spec.
export async function signInAsSeedRequester(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.setItem(
      'toktickit.requester',
      JSON.stringify({ id: 1, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th' }),
    )
  })
  await page.reload()
}

export const BREAKPOINTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 900 },
  mobile: { width: 390, height: 844 },
} as const
