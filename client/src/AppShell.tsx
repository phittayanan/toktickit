import type { ReactNode } from 'react'
import { useRequester } from './useRequester'

// The application shell (ui-spec.md §5): header with the selected
// Requester's name and a Change Requester action, reachable from every
// screen. Screens themselves are passed in as children.
function AppShell({ children }: { children: ReactNode }) {
  const { requester, changeRequester } = useRequester()

  return (
    <div className="app-shell">
      <header className="app-shell__header d-flex justify-content-between align-items-center px-4 py-3">
        <span className="app-shell__brand fw-semibold">TokTickIT</span>
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
