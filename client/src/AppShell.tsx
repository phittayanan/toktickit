import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { UserIdentity } from './api'
import { RoleBadge } from './badges'
import { InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'
import { activeEntry, LANDING_PATH, NAVIGATION } from './navigation'
import { useSession } from './useSession'

// Below the tablet breakpoint (ui-spec.md §11) the header is the mobile
// one. Bootstrap's own `md` breakpoint ends at the same width.
const MOBILE_QUERY = '(max-width: 767.98px)'

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(MOBILE_QUERY)
      media?.addEventListener('change', onChange)
      return () => media?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(MOBILE_QUERY).matches ?? false,
  )
}

// Logout (ui-spec.md §4.3): one click, no confirmation, busy while the
// request is in flight. Afterwards the guards show Login.
function useLogout(onFailed: (failed: boolean) => void) {
  const { signOut } = useSession()
  const [loggingOut, setLoggingOut] = useState(false)

  const logOut = async () => {
    setLoggingOut(true)
    onFailed(false)
    try {
      await signOut()
    } catch {
      // The Session may still exist, so the User stays signed in here.
      setLoggingOut(false)
      onFailed(true)
    }
  }

  return { loggingOut, logOut }
}

// Where Change Password returns to: the screen it was opened from. Chosen
// while it is already open, it stays as it is, with the return path it has.
function useOpenChangePassword() {
  const navigate = useNavigate()
  const location = useLocation()

  return () => {
    if (location.pathname === '/change-password') return
    navigate('/change-password', { state: { from: location.pathname + location.search } })
  }
}

// A Success notice handed over by the screen that navigated here. It shows
// until the next navigation, and is taken out of the browser's history
// entry (the router keeps location state there, under `usr`), so it shows
// once: not after a reload, and not on coming back to the entry.
function useHandedNotice(): string | undefined {
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice

  useEffect(() => {
    const entry = window.history.state
    if (notice && entry?.usr?.notice === notice) window.history.replaceState({ ...entry, usr: null }, '')
  }, [notice, location])

  return notice
}

// Role navigation with the active entry underlined. A destination the
// Role cannot use is not in its entries, so it is not rendered at all.
function RoleNavigation({
  user,
  className,
  onNavigate,
}: {
  user: UserIdentity
  className: string
  onNavigate?: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const entries = NAVIGATION[user.role]
  const active = activeEntry(entries, location.pathname)

  return (
    <nav className={className} aria-label="Primary">
      {entries.map((entry) => (
        <button
          key={entry.path}
          type="button"
          className={`app-shell__nav-link btn btn-link text-decoration-none ${
            entry === active ? 'fw-semibold text-decoration-underline' : ''
          }`}
          aria-current={entry === active ? 'page' : undefined}
          onClick={() => {
            onNavigate?.()
            navigate(entry.path)
          }}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  )
}

function LogoutLabel({ busy }: { busy: boolean }) {
  return (
    <>
      {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
      Logout
    </>
  )
}

// The user menu (ui-spec.md §4.1): a button showing the signed-in User's
// name and role badge, opening Change Password and Logout.
function UserMenu({ user, onLogoutFailed }: { user: UserIdentity; onLogoutFailed: (failed: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const { loggingOut, logOut } = useLogout((failed) => {
    if (failed) setOpen(false)
    onLogoutFailed(failed)
  })
  const openChangePassword = useOpenChangePassword()
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Escape and a click outside close the menu.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="app-shell__user position-relative" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className="app-shell__user-button btn d-flex align-items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="app-shell__user-name" title={user.name}>
          {user.name}
        </span>
        <RoleBadge role={user.role} />
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id={menuId} role="menu" className="app-shell__menu card">
          <button
            type="button"
            role="menuitem"
            className="app-shell__menu-item btn"
            onClick={() => {
              setOpen(false)
              openChangePassword()
            }}
          >
            Change Password
          </button>
          <button
            type="button"
            role="menuitem"
            className="app-shell__menu-item btn"
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={logOut}
          >
            <LogoutLabel busy={loggingOut} />
          </button>
        </div>
      )}
    </div>
  )
}

function Wordmark({ user }: { user: UserIdentity }) {
  return (
    <Link to={LANDING_PATH[user.role]} className="app-shell__brand fw-semibold text-decoration-none">
      TokTickIT
    </Link>
  )
}

// Desktop and tablet (ui-spec.md §4.4): one header row.
function DesktopHeader({ user, onLogoutFailed }: { user: UserIdentity; onLogoutFailed: (failed: boolean) => void }) {
  return (
    <header className="app-shell__header d-flex justify-content-between align-items-center px-4 py-3 gap-2">
      <div className="d-flex align-items-center gap-4">
        <Wordmark user={user} />
        <RoleNavigation user={user} className="d-flex gap-2" />
      </div>
      <UserMenu user={user} onLogoutFailed={onLogoutFailed} />
    </header>
  )
}

// Mobile (ui-spec.md §4.4): the navigation collapses behind a menu button,
// and the User's name, role badge, Change Password, and Logout are in the
// same menu.
function MobileHeader({ user, onLogoutFailed }: { user: UserIdentity; onLogoutFailed: (failed: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const { loggingOut, logOut } = useLogout((failed) => {
    if (failed) setOpen(false)
    onLogoutFailed(failed)
  })
  const openChangePassword = useOpenChangePassword()
  const panelId = useId()

  return (
    <header className="app-shell__header px-3 py-2">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <Wordmark user={user} />
        <button
          type="button"
          className="app-shell__menu-toggle btn btn-outline-light"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          Menu
        </button>
      </div>
      {open && (
        <div id={panelId} className="app-shell__mobile-panel">
          <RoleNavigation user={user} className="d-flex flex-column" onNavigate={() => setOpen(false)} />
          <div className="app-shell__mobile-user d-flex align-items-center flex-wrap gap-2">
            <span className="app-shell__user-name" title={user.name}>
              {user.name}
            </span>
            <RoleBadge role={user.role} />
          </div>
          <button
            type="button"
            className="app-shell__nav-link btn btn-link text-decoration-none"
            onClick={() => {
              setOpen(false)
              openChangePassword()
            }}
          >
            Change Password
          </button>
          <button
            type="button"
            className="app-shell__nav-link btn btn-link text-decoration-none"
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={logOut}
          >
            <LogoutLabel busy={loggingOut} />
          </button>
        </div>
      )}
    </header>
  )
}

// While the User must change their password the header shows only the
// wordmark and Logout (ui-spec.md §6, Mandatory), at every width.
function MandatoryHeader({ onLogoutFailed }: { onLogoutFailed: (failed: boolean) => void }) {
  const { loggingOut, logOut } = useLogout(onLogoutFailed)

  return (
    <header className="app-shell__header d-flex justify-content-between align-items-center px-3 px-md-4 py-2 py-md-3 gap-2">
      <span className="app-shell__brand fw-semibold">TokTickIT</span>
      <button
        type="button"
        className="app-shell__menu-toggle btn btn-outline-light"
        disabled={loggingOut}
        aria-busy={loggingOut}
        onClick={logOut}
      >
        <LogoutLabel busy={loggingOut} />
      </button>
    </header>
  )
}

// The application shell (docs/lab-03/ui-spec.md §4): the wordmark, the
// signed-in User's role navigation, and their user menu, reachable from
// every screen. Screens themselves are passed in as children.
function AppShell({ user, children }: { user: UserIdentity; children: ReactNode }) {
  const isMobile = useIsMobile()
  const [logoutFailed, setLogoutFailed] = useState(false)
  const notice = useHandedNotice()

  const Header = isMobile ? MobileHeader : DesktopHeader

  return (
    <div className="app-shell">
      {user.mustChangePassword ? (
        <MandatoryHeader onLogoutFailed={setLogoutFailed} />
      ) : (
        <Header user={user} onLogoutFailed={setLogoutFailed} />
      )}
      <main className="app-shell__main">
        {logoutFailed && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}
        {notice && <SuccessNotice>{notice}</SuccessNotice>}
        {children}
      </main>
    </div>
  )
}

export default AppShell
