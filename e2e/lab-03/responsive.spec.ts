import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ArrangedTicket } from './support/api'
import { signInAsUser } from './support/signIn'
import { E2E_USERS, type E2EUser } from './support/users'
import { BREAKPOINTS } from './support/screenshots'
import { createWorkedTicket } from './support/visualData'

// VIS-06 (docs/lab-03/tests.md): every Lab 3 screen at desktop, tablet, and
// mobile never scrolls horizontally, and the Ticket Queue and User
// Management are tables on desktop and tablet and cards on mobile
// (ui-spec.md §8.4, §10.3, §11). On mobile every control is a 44px tap
// target (§11).
interface Screen {
  name: string
  // Who opens the screen; nobody for Login.
  user?: E2EUser
  path: (ticket: ArrangedTicket) => string
  // Visible once the screen has its data.
  ready: (page: Page, ticket: ArrangedTicket) => Locator
}

const TICKET_QUEUE: Screen = {
  name: 'Ticket Queue',
  user: E2E_USERS.IT_STAFF,
  path: () => '/staff/queue',
  ready: (page, ticket) => page.getByRole('link', { name: ticket.ticketNumber }).locator('visible=true').first(),
}

const USER_MANAGEMENT: Screen = {
  name: 'User Management',
  user: E2E_USERS.ADMINISTRATOR,
  path: () => '/admin/users',
  ready: (page) => page.getByRole('button', { name: `Edit ${E2E_USERS.IT_STAFF.name}` }).locator('visible=true').first(),
}

const SCREENS: Screen[] = [
  {
    name: 'Login',
    path: () => '/login',
    ready: (page) => page.getByRole('heading', { name: 'Sign in to your account' }),
  },
  {
    name: 'Change Password',
    user: E2E_USERS.REQUESTER,
    path: () => '/change-password',
    ready: (page) => page.getByRole('heading', { name: 'Change Password' }),
  },
  {
    name: 'Requester Ticket Detail',
    user: E2E_USERS.REQUESTER,
    path: (ticket) => `/tickets/${ticket.id}`,
    ready: (page) => page.getByRole('heading', { name: 'Public Comments (2)' }),
  },
  TICKET_QUEUE,
  {
    name: 'Staff Ticket Detail',
    user: E2E_USERS.IT_STAFF,
    path: (ticket) => `/staff/tickets/${ticket.id}`,
    ready: (page) => page.getByRole('tab', { name: 'Public Comments (2)' }),
  },
  USER_MANAGEMENT,
]

// The page is no wider than the viewport, and nothing reaches past its
// right edge. The second check is needed because the page clips horizontal
// overflow (`overflow-x: hidden`), which would hide a control rather than
// scroll to it. Content that scrolls inside its own container is allowed.
async function expectNoHorizontalScroll(page: Page) {
  const measured = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth

    const clippedByContainer = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true
      }
      return false
    }

    const pastRightEdge = [...document.body.querySelectorAll('*')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && box.right > viewport + 1 && !clippedByContainer(element)
      })
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`)

    return {
      viewport,
      pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      pastRightEdge,
    }
  })

  expect(measured.pageWidth, 'page width against viewport').toBeLessThanOrEqual(measured.viewport)
  expect(measured.pastRightEdge, 'elements reaching past the right edge').toEqual([])
}

// Every control in view is at least 44px in both directions.
async function expectTapTargets(page: Page) {
  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll('a[href], button, input, select, textarea, [role="tab"]')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ element, box }) => {
        const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim()
        return `<${element.tagName.toLowerCase()}> "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`
      }),
  )

  expect(tooSmall, 'controls smaller than 44px').toEqual([])
}

test.describe('responsive: Lab 3 screens', () => {
  test.describe.configure({ mode: 'default' })

  let ticket: ArrangedTicket

  test.beforeAll(async () => {
    ticket = await createWorkedTicket()
  })

  async function open(page: Page, screen: Screen) {
    if (screen.user) await signInAsUser(page, screen.user)
    await page.goto(screen.path(ticket))
    await expect(screen.ready(page, ticket)).toBeVisible()
  }

  for (const screen of SCREENS) {
    for (const [name, size] of Object.entries(BREAKPOINTS)) {
      test(`${screen.name} does not scroll horizontally at ${name}`, async ({ page }) => {
        await page.setViewportSize(size)
        await open(page, screen)
        await expectNoHorizontalScroll(page)
      })
    }

    test(`${screen.name} has 44px tap targets at mobile`, async ({ page }) => {
      await page.setViewportSize(BREAKPOINTS.mobile)
      await open(page, screen)
      await expectTapTargets(page)
    })
  }

  test('Requester Ticket Detail that cannot load has 44px tap targets at mobile', async ({ page }) => {
    await page.setViewportSize(BREAKPOINTS.mobile)
    await signInAsUser(page, E2E_USERS.REQUESTER)
    await page.route(`**/api/tickets/${ticket.id}`, (route) => route.abort())
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByRole('alert').getByRole('button', { name: 'Retry' })).toBeVisible()
    await expectTapTargets(page)
  })

  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    const layout = name === 'mobile' ? 'cards' : 'a table'

    test(`Ticket Queue is ${layout} at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await open(page, TICKET_QUEUE)
      const table = page.getByRole('table')
      const cards = page.locator('.tk-queue__card')

      if (name === 'mobile') {
        await expect(table).toBeHidden()
        await expect(cards.first()).toBeVisible()
      } else {
        await expect(table).toBeVisible()
        await expect(cards.first()).toBeHidden()
      }
    })

    test(`User Management is ${layout} at ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await open(page, USER_MANAGEMENT)
      const table = page.getByRole('table')
      const cards = page.getByRole('list', { name: 'Users' }).getByRole('listitem')

      if (name === 'mobile') {
        await expect(table).toBeHidden()
        await expect(cards.first()).toBeVisible()
      } else {
        await expect(table).toBeVisible()
        await expect(cards.first()).toBeHidden()
      }
    })
  }
})
