// The three widths every Lab 3 screen is captured at (tests.md §1).
export const BREAKPOINTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 900 },
  mobile: { width: 390, height: 844 },
} as const

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
