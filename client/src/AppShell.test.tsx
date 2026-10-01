import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import * as api from './api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedInAs, signedOut } from './test/session'

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue([{ id: 1, name: 'Hardware' }])
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue([{ id: 1, name: 'Wi-Fi' }])
  vi.spyOn(api, 'fetchTickets').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
  vi.spyOn(api, 'fetchAdminUsers').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function navigationEntries() {
  const nav = within(screen.getByRole('navigation', { name: 'Primary' }))
  return nav.getAllByRole('button').map((entry) => entry.textContent)
}

describe('Shell', () => {
  // UI-07 (AC-14): only the role's entries; name and role badge; no
  // selector and no Change Requester
  it.each([
    { user: REQUESTER, path: '/tickets', entries: ['My Tickets', 'Create Ticket'], badge: 'Requester' },
    { user: IT_STAFF, path: '/staff/queue', entries: ['Ticket Queue'], badge: 'IT Staff' },
    {
      user: ADMINISTRATOR,
      path: '/admin/users',
      entries: ['Ticket Queue', 'User Management'],
      badge: 'Administrator',
    },
  ])('shows $badge only their navigation, with their name and role badge', async ({ user, path, entries, badge }) => {
    signedInAs(user)
    openPath(path)

    render(<App />)

    const userMenu = await screen.findByRole('button', { name: new RegExp(user.name) })
    expect(within(userMenu).getByText(badge)).toBeInTheDocument()
    expect(navigationEntries()).toEqual(entries)
    expect(screen.getByRole('link', { name: 'TokTickIT' })).toHaveAttribute('href', path)
    expect(screen.queryByRole('button', { name: /change requester/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/development requester/i)).not.toBeInTheDocument()
  })

  // specification.md §7.3: the Lab 2 selector's stored identity is removed
  // on start
  it('removes the legacy toktickit.requester storage key on start', async () => {
    window.localStorage.setItem('toktickit.requester', JSON.stringify({ id: 1, name: 'Somchai Jaidee' }))
    signedInAs(REQUESTER)
    openPath('/tickets')

    render(<App />)

    await screen.findByRole('heading', { name: 'My Tickets' })
    expect(window.localStorage.getItem('toktickit.requester')).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })
})

describe('User menu', () => {
  // ui-spec.md §4.1: the user menu contains Change Password and Logout
  it('holds Change Password and Logout', async () => {
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))

    const menu = within(screen.getByRole('menu'))
    expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Change Password', 'Logout'])
  })

  // ui-spec.md §12: Escape closes the menu and returns focus to its button
  it('closes on Escape and returns focus to the user menu button', async () => {
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)
    const userMenu = await screen.findByRole('button', { name: /Somchai Jaidee/ })
    fireEvent.click(userMenu)
    expect(userMenu).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(userMenu).toHaveAttribute('aria-expanded', 'false')
    expect(userMenu).toHaveFocus()
  })

  // UI-09 (AC-10): Logout from the menu -> one logout call, then Login
  it('logs out in one click, busy while the request is in flight, then shows Login', async () => {
    let finish: () => void = () => {}
    const logout = vi.spyOn(api, 'logout').mockReturnValue(new Promise((resolve) => (finish = resolve)))
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))

    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))

    expect(logout).toHaveBeenCalledTimes(1)
    const busyItem = screen.getByRole('menuitem', { name: /Logout/ })
    expect(busyItem).toBeDisabled()
    expect(busyItem).toHaveAttribute('aria-busy', 'true')

    finish()

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(screen.queryByText('Your session has ended. Please sign in again.')).not.toBeInTheDocument()
  })
})

describe('Mobile shell', () => {
  // ui-spec.md §4.4: below 768px the navigation collapses behind a menu
  // button; the name, role badge, Change Password, and Logout are in the
  // same menu
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767.98px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  async function openMobileMenu() {
    signedInAs(ADMINISTRATOR)
    openPath('/admin/users')
    render(<App />)
    const menuButton = await screen.findByRole('button', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument()

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  }

  it('keeps navigation, name, role badge, Change Password, and Logout in one menu', async () => {
    await openMobileMenu()

    expect(navigationEntries()).toEqual(['Ticket Queue', 'User Management'])
    const banner = within(screen.getByRole('banner'))
    expect(banner.getByText('Apinya Thongchai')).toBeInTheDocument()
    expect(banner.getByText('Administrator')).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Change Password' })).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('closes the menu after navigating from it', async () => {
    await openMobileMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Ticket Queue' }))

    await waitFor(() => expect(window.location.pathname).toBe('/staff/queue'))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('closes the menu after the wordmark is used', async () => {
    await openMobileMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Ticket Queue' }))
    await waitFor(() => expect(window.location.pathname).toBe('/staff/queue'))
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('link', { name: 'TokTickIT' }))

    await waitFor(() => expect(window.location.pathname).toBe('/admin/users'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  // Change Password chosen again while already open keeps its return path
  it('still returns to the previous screen when Change Password is opened again from the menu', async () => {
    await openMobileMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    await screen.findByRole('heading', { name: 'Change Password' })

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Change Password' }))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.pathname).toBe('/admin/users'))
  })

  it('logs out from the menu', async () => {
    const logout = vi.spyOn(api, 'logout').mockResolvedValue()
    await openMobileMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(logout).toHaveBeenCalledTimes(1)
  })
})

describe('Logout and session end', () => {
  // ui-spec.md §4.3: Back after Logout does not reveal a protected screen
  it('keeps showing Login when Back is pressed after Logout', async () => {
    vi.spyOn(api, 'logout').mockResolvedValue()
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))
    await screen.findByRole('heading', { name: 'Sign in to your account' })
    vi.mocked(api.fetchTickets).mockClear()

    const wentBack = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    window.history.back()
    await wentBack

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(api.fetchTickets).not.toHaveBeenCalled()
  })

  // AC-52: a Logout that fails leaves the user signed in, with the safe message
  it('stays signed in and shows the safe failure message when Logout fails', async () => {
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))

    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/tickets')
  })

  // The failure message belongs to the screen where Logout failed
  it('clears the Logout failure message when the user goes to another screen', async () => {
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    signedInAs(REQUESTER)
    openPath('/tickets')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()

    const navigation = within(screen.getByRole('navigation', { name: 'Primary' }))
    fireEvent.click(navigation.getByRole('button', { name: 'Create Ticket' }))

    expect(await screen.findByRole('heading', { name: 'Create Ticket' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Somchai Jaidee/ })).toBeInTheDocument()
  })

  // UI-09 (AC-10): any request answering 401 UNAUTHENTICATED while signed
  // in -> client state cleared, Login with the session-ended alert
  it('shows Login with the session-ended alert when a request answers 401', async () => {
    vi.mocked(api.fetchTickets).mockRestore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'You are not signed in.', code: 'UNAUTHENTICATED' }, { status: 401 })),
    )
    signedInAs(REQUESTER)
    openPath('/tickets')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has ended. Please sign in again.')
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  // ui-spec.md §4.2: the alert is for a session that ended, not for a
  // visitor who was never signed in
  it('shows no session-ended alert to a visitor who was not signed in', async () => {
    signedOut()
    openPath('/tickets')

    render(<App />)

    await screen.findByRole('heading', { name: 'Sign in to your account' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Guards', () => {
  // UI-08 (AC-14): signed out, any protected path -> Login
  it('shows Login to a signed-out visitor of a protected path', async () => {
    signedOut()
    openPath('/tickets')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  // UI-08 (AC-02): must change password, any other path -> Change Password
  it('confines a user who must change their password to Change Password', async () => {
    signedInAs({ ...REQUESTER, mustChangePassword: true })
    openPath('/tickets')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Change Password' })).toBeInTheDocument()
    expect(screen.getByText('You must change your password to continue.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
    expect(screen.queryByRole('heading', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(api.fetchTickets).not.toHaveBeenCalled()
  })

  // UI-08 (AC-14): signed in, path of another role -> Forbidden page, and
  // no protected data is requested
  it.each([
    { user: REQUESTER, path: '/staff/queue', landing: 'My Tickets' },
    { user: REQUESTER, path: '/staff/tickets/5', landing: 'My Tickets' },
    { user: REQUESTER, path: '/admin/users', landing: 'My Tickets' },
    { user: IT_STAFF, path: '/admin/users', landing: 'Ticket Queue' },
    { user: IT_STAFF, path: '/tickets', landing: 'Ticket Queue' },
    { user: ADMINISTRATOR, path: '/tickets/new', landing: 'User Management' },
    { user: ADMINISTRATOR, path: '/tickets/42', landing: 'User Management' },
  ])('shows the Forbidden page to $user.role at $path', async ({ user, path, landing }) => {
    const fetchTicketById = vi.spyOn(api, 'fetchTicketById')
    signedInAs(user)
    openPath(path)

    render(<App />)

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Go to ${landing}` })).toBeInTheDocument()
    expect(api.fetchTickets).not.toHaveBeenCalled()
    expect(api.fetchCategories).not.toHaveBeenCalled()
    expect(fetchTicketById).not.toHaveBeenCalled()
  })

  // UI-08 (AC-14): unknown path -> Not Found page
  it('shows the Not Found page for an unknown path', async () => {
    signedInAs(REQUESTER)
    openPath('/no-such-screen')

    render(<App />)

    expect(await screen.findByRole('heading', { name: "We couldn't find that page" })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My Tickets' })).toHaveAttribute('href', '/tickets')
  })

  // The Ticket Queue (#51) and Staff Ticket Detail (#51, #52) screens are
  // not built yet: until they are, their paths show the Not Found page to
  // the roles that may open them.
  it.each([
    { user: IT_STAFF, path: '/staff/queue', back: 'Back to Ticket Queue' },
    { user: IT_STAFF, path: '/staff/tickets/5', back: 'Back to Ticket Queue' },
    { user: ADMINISTRATOR, path: '/staff/queue', back: 'Back to User Management' },
  ])('shows the Not Found page to $user.role at the unbuilt $path', async ({ user, path, back }) => {
    signedInAs(user)
    openPath(path)

    render(<App />)

    expect(await screen.findByRole('heading', { name: "We couldn't find that page" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: back })).toBeInTheDocument()
  })

  // ui-spec.md §2.3: "Ticket not found" for a Ticket path that names no Ticket
  it('shows "Ticket not found" for a Ticket path whose id is not a number', async () => {
    const fetchTicketById = vi.spyOn(api, 'fetchTicketById')
    signedInAs(REQUESTER)
    openPath('/tickets/not-a-ticket')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My Tickets' })).toBeInTheDocument()
    expect(fetchTicketById).not.toHaveBeenCalled()
  })

  // ui-spec.md §4.2: signed in, opens /login -> the landing screen
  it.each([
    { user: REQUESTER, path: '/login', landing: '/tickets' },
    { user: IT_STAFF, path: '/login', landing: '/staff/queue' },
    { user: ADMINISTRATOR, path: '/login', landing: '/admin/users' },
    { user: REQUESTER, path: '/', landing: '/tickets' },
  ])('sends a signed-in $user.role from $path to their landing screen', async ({ user, path, landing }) => {
    signedInAs(user)
    openPath(path)

    render(<App />)

    await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() => expect(window.location.pathname).toBe(landing))
    expect(screen.queryByRole('heading', { name: 'Sign in to your account' })).not.toBeInTheDocument()
  })

  // ui-spec.md §4.2: app start -> full-page loading, no protected content
  it('shows a full-page loading state and nothing protected while the current user is fetched', async () => {
    let answer: (user: typeof REQUESTER) => void = () => {}
    vi.spyOn(api, 'fetchCurrentUser').mockReturnValue(new Promise((resolve) => (answer = resolve)))
    openPath('/tickets')

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(api.fetchTickets).not.toHaveBeenCalled()

    answer(REQUESTER)
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})
