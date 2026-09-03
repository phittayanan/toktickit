// Persists the selected Development Requester to localStorage (ADR-0001)
// and gives api.ts a synchronous way to read it for X-Requester-Id
// injection (ADR-0006, FR-03) without importing React. Always reads
// localStorage fresh rather than caching in a module variable, so a
// second tab/window's selection (or a test resetting localStorage) is
// picked up immediately.

const STORAGE_KEY = 'toktickit.requester'

export interface StoredRequester {
  id: number
  name: string
  email: string
}

export function getRequester(): StoredRequester | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredRequester
  } catch {
    return null
  }
}

export function setRequester(requester: StoredRequester): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requester))
  } catch {
    // localStorage unavailable (private mode, storage full, etc.) — the
    // selection still works for the current render via React state, it
    // just won't survive a reload.
  }
}

export function clearRequester(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // see setRequester
  }
}
