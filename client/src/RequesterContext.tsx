import { useState, type ReactNode } from 'react'
import {
  getRequester,
  setRequester as persistRequester,
  clearRequester as clearPersistedRequester,
  type StoredRequester,
} from './requesterStore'
import { RequesterContext } from './requesterContextObject'

export function RequesterProvider({ children }: { children: ReactNode }) {
  // Reads localStorage once on mount — this is what makes a selection
  // survive a page refresh (AC-07).
  const [requester, setRequesterState] = useState<StoredRequester | null>(() => getRequester())

  const selectRequester = (next: StoredRequester) => {
    persistRequester(next)
    setRequesterState(next)
  }

  const changeRequester = () => {
    clearPersistedRequester()
    setRequesterState(null)
  }

  return (
    <RequesterContext.Provider value={{ requester, selectRequester, changeRequester }}>
      {children}
    </RequesterContext.Provider>
  )
}
