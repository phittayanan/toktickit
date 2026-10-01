import { useContext } from 'react'
import { SessionContext } from './sessionContextObject'

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
