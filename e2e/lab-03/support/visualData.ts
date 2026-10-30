import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { addDoneAction, apiSessionFor, createTicketFor, type ArrangedTicket } from './api'
import { ensureUsers } from './database'
import { E2E_USERS, type E2EUser } from './users'

// What the visual and responsive suites (tests.md VIS-01 to VIS-06) need
// beyond the shared E2E support: Tickets and users with enough on them to
// judge a screen by, and the checks a screenshot cannot make by itself.

// A long name and email on an inactive account, so that User Management is
// judged with values that have to wrap or truncate (ui-spec.md §11), and
// with every Role and Account badge on screen.
export function ensureLongNamedUser() {
  ensureUsers([
    {
      name: 'E2E Visual Kanokwan Rattanaphongsakorn-Charoenwattanakul',
      email: 'e2e.visual.kanokwan.rattanaphongsakorn-charoenwattanakul@kmutt.ac.th',
      password: E2E_USERS.IT_STAFF.password,
      role: 'IT_STAFF',
      isActive: false,
    },
  ])
}

async function send(api: APIRequestContext, method: 'post' | 'put', url: string, data?: object) {
  const res = await api[method](url, { data })
  expect(res.ok(), `${method.toUpperCase()} ${url} answered ${res.status()}`).toBe(true)

  return res.json()
}

// A long Summary and a comment holding an unbroken link: the values that
// ui-spec.md §11 says must wrap or truncate rather than widen the page.
const SUMMARY =
  'Cannot connect to the campus VPN from the engineering building laboratory computers since the certificate renewal'
const LINK =
  'https://support.kmutt.ac.th/knowledge-base/network/vpn/troubleshooting/certificate-renewal-and-trust-store-update-2026'

// A NEW Ticket of the E2E Requester, as Create Ticket leaves it.
export function createNewTicket(): Promise<ArrangedTicket> {
  return createTicketFor(E2E_USERS.REQUESTER, SUMMARY)
}

// A Ticket that is being worked: owned by the E2E IT Staff user and In
// Progress, with Public Comments from both sides, Internal Notes, a Done
// Action Taken, and the Requester's indication that the problem appears
// resolved.
export async function createWorkedTicket(): Promise<ArrangedTicket> {
  const ticket = await createNewTicket()

  const requester = await apiSessionFor(E2E_USERS.REQUESTER)
  await send(requester, 'post', `/api/tickets/${ticket.id}/comments`, {
    body: `It fails on every computer in room 301. I followed the guide at ${LINK} without success.`,
  })

  const staff = await apiSessionFor(E2E_USERS.IT_STAFF)
  const { id: staffId } = await staff.get('/api/auth/me').then((res) => res.json())
  const staffTicket = `/api/staff/tickets/${ticket.id}`
  await send(staff, 'put', `${staffTicket}/owner`, { ownerId: staffId, expectedOwnerId: null })
  await send(staff, 'post', `${staffTicket}/status`, { status: 'IN_PROGRESS', expectedStatus: 'OPEN' })
  await send(staff, 'put', `${staffTicket}/it-priority`, { itPriority: 'HIGH' })
  await send(staff, 'post', `/api/tickets/${ticket.id}/comments`, {
    body: 'Thank you. The trust store on the laboratory image is out of date. We are rolling out the fix today.',
  })
  await send(staff, 'post', `${staffTicket}/notes`, {
    body: 'Root cause: the laboratory image still ships the 2025 trust store. Image rebuild requested from the platform team.',
  })
  await send(staff, 'post', `${staffTicket}/notes`, {
    body: `Vendor reference for the renewal: ${LINK}`,
  })
  await staff.dispose()
  await addDoneAction(E2E_USERS.IT_STAFF, ticket.id)

  await send(requester, 'put', `/api/tickets/${ticket.id}/resolution-indication`)
  await requester.dispose()

  return ticket
}

// Changes a Ticket's status behind the page's back, as another member of
// IT Staff would, so that the page's next change meets a conflict.
export async function changeStatusElsewhere(ticket: ArrangedTicket, status: string, expectedStatus: string) {
  const api = await apiSessionFor(E2E_USERS.ADMINISTRATOR)
  await send(api, 'post', `/api/staff/tickets/${ticket.id}/status`, { status, expectedStatus })
  await api.dispose()
}

// Zen Green tokens (client/src/theme.css), as the browser reports a colour.
export const TOKENS = {
  primaryGreen: 'rgb(0, 107, 60)',
  secondaryGreen: 'rgb(11, 122, 70)',
  error: 'rgb(179, 38, 30)',
  readonlyBackground: 'rgb(241, 243, 241)',
  fieldBorder: 'rgb(201, 211, 207)',
  text: 'rgb(26, 46, 39)',
  neutralText: 'rgb(79, 95, 89)',
  surface: 'rgb(255, 255, 255)',
}

// Moves keyboard focus to `target` with the Tab key, so the browser shows
// the focus indicator a keyboard user sees, and checks that it is shown.
export async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 80; presses += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target, 'focus indicator').toHaveCSS('outline-style', 'solid')
      return
    }
  }

  throw new Error('The Tab key never reached the control')
}

// A dialog keeps keyboard focus inside while it is open (ui-spec.md §12).
export async function expectFocusKept(page: Page, dialog: Locator) {
  for (let presses = 0; presses < 8; presses += 1) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }
}

// Opens the menu that holds Change Password and Logout: the user menu on
// desktop and tablet, the Menu panel on mobile (ui-spec.md §4.4). At every
// width the user's name and role badge are then in view.
export async function openUserMenu(page: Page, user: E2EUser, roleLabel: string) {
  const mobileMenu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  else await page.locator('button[aria-haspopup="menu"]').click()

  const inView = (text: string) => page.getByText(text, { exact: true }).locator('visible=true').first()
  await expect(inView(user.name)).toBeVisible()
  await expect(inView(roleLabel)).toBeVisible()
  await expect(inView('Change Password')).toBeVisible()
  await expect(inView('Logout')).toBeVisible()
}

// The text a select shows fits inside it: a native select cannot show an
// ellipsis, so text that does not fit is clipped (ui-spec.md §11).
export async function expectSelectTextFits(select: Locator) {
  const { needed, available } = await select.evaluate((element: HTMLSelectElement) => {
    const style = getComputedStyle(element)
    const context = document.createElement('canvas').getContext('2d')!
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

    return {
      needed: context.measureText(element.selectedOptions[0].text).width,
      available: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    }
  })

  expect(needed, 'width of the text the select shows').toBeLessThanOrEqual(available)
}

// Holds every request matching `url` until the returned function is
// called, so a screen stays in its loading state.
export async function holdRequests(page: Page, url: string | RegExp) {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(url, async (route) => {
    await held
    await route.continue()
  })

  return release
}
