import { useEffect, useState } from 'react'
import { fetchRequesters, type Requester } from './api'
import { useRequester } from './useRequester'

type FetchState =
  | { status: 'loading' }
  | { status: 'success'; requesters: Requester[] }
  | { status: 'error'; message: string }

// The Development Requester Selection screen (ui-spec.md §6) — a Lab 2
// testing mechanism, explicitly not a login screen (BR-03).
function RequesterSelector() {
  const { selectRequester } = useRequester()
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let cancelled = false

    fetchRequesters()
      .then((requesters) => {
        if (!cancelled) setState({ status: 'success', requesters })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unable to load Development Requesters',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleContinue = () => {
    if (state.status !== 'success') return
    const requester = state.requesters.find((r) => String(r.id) === selectedId)
    if (requester) selectRequester(requester)
  }

  return (
    <div className="requester-selector container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-3">TokTickIT</h1>
      <p className="text-muted mb-4">
        Select a Development Requester to test requester-specific ticket behavior. This is
        not a login screen. Authentication and role-based access will be introduced in Lab 3.
      </p>

      {state.status === 'loading' && <p role="status">⏳ Loading Development Requesters…</p>}

      {state.status === 'error' && (
        <p className="text-danger" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'success' && state.requesters.length === 0 && (
        <p role="status">No Development Requester is available. Please contact IT to seed one.</p>
      )}

      {state.status === 'success' && state.requesters.length > 0 && (
        <>
          <div className="mb-3 text-start">
            <label htmlFor="requester-select" className="form-label">
              Development Requester <span className="text-danger">*</span>
            </label>
            <select
              id="requester-select"
              className="form-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="" disabled>
                Choose a Requester…
              </option>
              {state.requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.name} ({requester.email})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary w-100"
            disabled={!selectedId}
            onClick={handleContinue}
          >
            Continue
          </button>
        </>
      )}
    </div>
  )
}

export default RequesterSelector
