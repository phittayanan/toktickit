import { useContext } from 'react'
import { RequesterContext } from './requesterContextObject'

export function useRequester() {
  const context = useContext(RequesterContext)
  if (!context) {
    throw new Error('useRequester must be used within a RequesterProvider')
  }
  return context
}
