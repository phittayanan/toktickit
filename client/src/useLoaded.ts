import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'forbidden' }
  | { status: 'failed' }

// One dashboard request and its outcome. Until the answer of the current
// attempt arrives, the state is loading, so Retry shows the skeleton again.
export function useLoaded<T>(load: () => Promise<T>): { state: Loaded<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{ attempt: number; state: Loaded<T> } | null>(null)

  useEffect(() => {
    let cancelled = false

    load()
      .then((data) => {
        if (!cancelled) setAnswer({ attempt, state: { status: 'loaded', data } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const forbidden = err instanceof ApiError && err.status === 403
        setAnswer({ attempt, state: { status: forbidden ? 'forbidden' : 'failed' } })
      })

    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  return { state: answer?.attempt === attempt ? answer.state : { status: 'loading' }, retry }
}
