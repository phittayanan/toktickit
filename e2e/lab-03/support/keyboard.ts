import { expect, type Locator, type Page } from '@playwright/test'

// What counts as a control (AC-51). A tab that is not selected is left out:
// the tab pattern reaches it with the arrow keys, not with Tab (ui-spec.md
// §12), and the spec presses those itself.
const CONTROLS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const MAX_TAB_PRESSES = 200

type Step =
  | { kind: 'left-the-page' }
  | { kind: 'cycled' }
  | { kind: 'control'; label: string; inScope: boolean; focusVisible: boolean; hasIndicator: boolean }

// Presses Tab until focus comes back to a control it has already been on,
// and checks what AC-51 asks of a keyboard-only user: every control in
// `scope` is reached, shows a visible focus indicator, and has an
// accessible name. With `trapped` (an open dialog), focus must also never
// leave `scope`. A control is described by its tag and text, never by its
// value, so that a failure cannot print what a field holds.
export async function expectKeyboardReachable(page: Page, scope: Locator, { trapped = false } = {}) {
  const root = await scope.elementHandle()
  expect(root, 'the area to walk through').not.toBeNull()
  await page.evaluate(() => {
    ;(window as unknown as { __focusWalk: Element[] }).__focusWalk = []
  })

  let cycled = false
  for (let press = 0; press < MAX_TAB_PRESSES && !cycled; press += 1) {
    await page.keyboard.press('Tab')
    const step: Step = await page.evaluate((area) => {
      const walk = (window as unknown as { __focusWalk: Element[] }).__focusWalk
      const element = document.activeElement
      if (!element || element === document.body || element === document.documentElement) {
        return { kind: 'left-the-page' }
      }
      if (walk.includes(element)) return { kind: 'cycled' }
      walk.push(element)

      const style = getComputedStyle(element)
      const text = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)
      return {
        kind: 'control',
        label: `<${element.tagName.toLowerCase()}${element.id ? ` #${element.id}` : ''}> "${text}"`,
        inScope: area !== null && area.contains(element),
        focusVisible: element.matches(':focus-visible'),
        hasIndicator: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none',
      }
    }, root)

    if (step.kind === 'cycled') {
      cycled = true
    } else if (step.kind === 'left-the-page') {
      expect(trapped, 'focus left the dialog').toBe(false)
    } else {
      if (trapped) expect(step.inScope, `${step.label} took focus outside the dialog`).toBe(true)
      expect(step.focusVisible && step.hasIndicator, `${step.label} shows a visible focus indicator`).toBe(true)
      await expect(page.locator('*:focus'), `${step.label} has an accessible name`).toHaveAccessibleName(/\S/)
    }
  }
  expect(cycled, 'Tab came back round to a control it had already been on').toBe(true)

  const unreached = await page.evaluate(
    ([area, selector]) => {
      const walk = (window as unknown as { __focusWalk: Element[] }).__focusWalk
      return Array.from((area as Element).querySelectorAll(selector as string))
        .filter(
          (control) =>
            !(control as HTMLButtonElement).disabled &&
            control.getAttribute('aria-disabled') !== 'true' &&
            !(control.getAttribute('role') === 'tab' && control.getAttribute('aria-selected') === 'false') &&
            control.closest('[hidden], [inert], [aria-hidden="true"]') === null &&
            control.checkVisibility({ visibilityProperty: true }) &&
            !walk.includes(control),
        )
        .map((control) => {
          const text = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 40)
          return `<${control.tagName.toLowerCase()}${control.id ? ` #${control.id}` : ''}> "${text}"`
        })
    },
    [root, CONTROLS] as const,
  )
  expect(unreached, 'controls that Tab never reached').toEqual([])
}

// An open dialog (ui-spec.md §12): labelled by its title, holding focus,
// and keeping it in both directions.
export async function expectFocusTrapped(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName(/\S/)
  await expect(dialog.locator('*:focus')).toHaveCount(1)

  await expectKeyboardReachable(page, dialog, { trapped: true })

  // Back past the first control: focus goes to the last one, still inside.
  for (let press = 0; press < 2; press += 1) {
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.locator('*:focus')).toHaveCount(1)
  }
}

// Opens a dialog from `opener` with the keyboard alone, checks the trap,
// then checks that Escape closes it and gives focus back to `opener`.
export async function expectDialogOpensTrapsAndReturnsFocus(page: Page, opener: Locator, dialog: Locator) {
  await opener.focus()
  await page.keyboard.press('Enter')
  await expectFocusTrapped(page, dialog)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
}
