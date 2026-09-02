import { createContext } from 'react'
import type { StoredRequester } from './requesterStore'

export interface RequesterContextValue {
  requester: StoredRequester | null
  selectRequester: (requester: StoredRequester) => void
  changeRequester: () => void
}

export const RequesterContext = createContext<RequesterContextValue | undefined>(undefined)
