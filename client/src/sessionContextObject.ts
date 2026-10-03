import { createContext } from 'react'
import type { UserIdentity } from './api'

export interface SessionContextValue {
  // The signed-in User, or null when nobody is signed in.
  user: UserIdentity | null
  // True once a request answered 401 while a User was signed in
  // (ui-spec.md §4.2), until someone signs in again.
  sessionEnded: boolean
  // Records the User a successful login or password change returned.
  signIn: (user: UserIdentity) => void
  // Ends the Session on the server, then forgets the User here.
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined)
