import type { ReactNode } from 'react'
import { useRequester } from './useRequester'

export type Screen = 'myTickets' | 'createTicket'

// The application shell (ui-spec.md §5): header with nav links, the
// selected Requester's name and a Change Requester action, reachable from
// every screen. Screens themselves are passed in as children.
function AppShell({
  children,
  activeScreen,
  onNavigate,
}: {
  children: ReactNode
  activeScreen: Screen
  onNavigate: (screen: Screen) => void
}) {
  const { requester, changeRequester } = useRequester()

  const navLinkClass = (screen: Screen) =>
    `app-shell__nav-link btn btn-link text-decoration-none ${
      activeScreen === screen ? 'fw-semibold text-decoration-underline' : ''
    }`

  return (
    <div className="app-shell">
      <header className="app-shell__header d-flex justify-content-between align-items-center px-4 py-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-4">
          <span className="app-shell__brand fw-semibold">TokTickIT</span>
          <nav className="d-flex gap-2" aria-label="Primary">
            <button
              type="button"
              className={navLinkClass('myTickets')}
              aria-current={activeScreen === 'myTickets' ? 'page' : undefined}
              onClick={() => onNavigate('myTickets')}
            >
              My Tickets
            </button>
            <button
              type="button"
              className={navLinkClass('createTicket')}
              aria-current={activeScreen === 'createTicket' ? 'page' : undefined}
              onClick={() => onNavigate('createTicket')}
            >
              Create Ticket
            </button>
          </nav>
        </div>
        {requester && (
          <div className="app-shell__requester d-flex align-items-center gap-3">
            <span>{requester.name}</span>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={changeRequester}>
              Change Requester
            </button>
          </div>
        )}
      </header>
      <main className="app-shell__main">{children}</main>
    </div>
  )
}

export default AppShell
