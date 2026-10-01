import { useEffect, useState, type ReactNode } from 'react'
import { fetchCurrentUser, logout, onUnauthenticated, type UserIdentity } from './api'
import { SessionContext } from './sessionContextObject'

// The Lab 2 Development Requester selector kept its choice under this key.
// specification.md §7.3: it is removed on start, and nothing replaces it.
const LEGACY_REQUESTER_KEY = 'toktickit.requester'

function removeLegacyRequester(): void {
  try {
    window.localStorage.removeItem(LEGACY_REQUESTER_KEY)
  } catch {
    // localStorage unavailable (private mode): there is nothing to remove.
  }
}

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; user: UserIdentity | null; sessionEnded: boolean }

// Holds who is signed in. The Session itself lives in the httpOnly cookie
// (specification.md BR-13); this only mirrors what GET /api/auth/me says
// about it, in memory, and nothing is written to browser storage.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    removeLegacyRequester()

    let cancelled = false

    fetchCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ status: 'ready', user, sessionEnded: false })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'ready', user: null, sessionEnded: false })
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ui-spec.md §4.2: a request answering 401 UNAUTHENTICATED while a User
  // was signed in clears the client state. A visitor who was never signed
  // in is not told their session ended.
  useEffect(
    () =>
      onUnauthenticated(() => {
        setState((prev) =>
          prev.status === 'ready' && prev.user ? { status: 'ready', user: null, sessionEnded: true } : prev,
        )
      }),
    [],
  )

  // ui-spec.md §4.2: nothing protected renders until the current user is
  // known.
  if (state.status === 'loading') {
    return (
      <div className="tk-page-loading" role="status">
        Loading…
      </div>
    )
  }

  const signIn = (user: UserIdentity) => {
    setState({ status: 'ready', user, sessionEnded: false })
  }

  const signOut = async () => {
    await logout()
    setState({ status: 'ready', user: null, sessionEnded: false })
  }

  return (
    <SessionContext.Provider value={{ user: state.user, sessionEnded: state.sessionEnded, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}
