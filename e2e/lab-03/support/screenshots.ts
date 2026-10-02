import type { Locator, Page } from '@playwright/test'

// The three widths every Lab 3 screen is captured at (tests.md §1): one in
// each band of ui-spec.md §11.
export const BREAKPOINTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 900 },
  mobile: { width: 390, height: 844 },
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const BREAKPOINT_NAMES = Object.keys(BREAKPOINTS) as Breakpoint[]

// The screenshot folders of ui-spec.md §14.
export type ScreenshotGroup =
  | 'authentication'
  | 'requester-ticket-detail'
  | 'staff-queue'
  | 'staff-ticket-detail'
  | 'user-management'

export function screenshotPath(group: ScreenshotGroup, name: string): string {
  return `artifacts/lab-03/screenshots/${group}/${name}.png`
}

// Stores a screenshot as visual-checklist evidence (ui-spec.md §13): the
// whole page, or only what is in view when `viewportOnly` is set, as for a
// dialog, which covers the viewport rather than the page. `mask` covers
// anything that must not be committed in an image, such as a generated
// Initial Password.
export async function takeScreenshot(
  page: Page,
  group: ScreenshotGroup,
  name: string,
  options: { mask?: Locator[]; viewportOnly?: boolean } = {},
) {
  // The pointer is parked where it hovers over nothing.
  await page.mouse.move(0, 0)
  // Bootstrap animates the scroll to a focused control, which a picture of
  // the viewport would catch half way: the control is brought into view at
  // once, and the picture waits until the page is still.
  if (options.viewportOnly) {
    await page.evaluate(() => {
      const focused = document.activeElement
      if (focused && focused !== document.body) focused.scrollIntoView({ block: 'center', behavior: 'instant' })
    })
  }
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const before = window.scrollY
        setTimeout(() => resolve(window.scrollY === before), 250)
      }),
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.screenshot({
    path: screenshotPath(group, name),
    fullPage: !options.viewportOnly,
    animations: 'disabled',
    mask: options.mask,
  })
}
