import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RequesterSelector from './RequesterSelector'
import { RequesterProvider } from './RequesterContext'
import * as api from './api'

const ACTIVE_REQUESTERS = [
  { id: 1, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th' },
  { id: 2, name: 'Nalinee Suksawat', email: 'nalinee.suksawat@kmutt.ac.th' },
]

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderSelector() {
  return render(
    <RequesterProvider>
      <RequesterSelector />
    </RequesterProvider>,
  )
}

// UI-04: loading / empty / failure states (AC-04, AC-05, AC-06)
describe('RequesterSelector states', () => {
  it('shows a loading state while the active-Requester list is fetching, with no Continue action available', () => {
    vi.spyOn(api, 'fetchRequesters').mockReturnValue(new Promise(() => {}))
    renderSelector()

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()
  })

  it('shows an empty state explaining that no Requester is available', async () => {
    vi.spyOn(api, 'fetchRequesters').mockResolvedValue([])
    renderSelector()

    await waitFor(() => {
      expect(screen.getByText(/no development requester is available/i)).toBeInTheDocument()
    })
  })

  it('shows a safe failure state when the fetch fails, without crashing', async () => {
    vi.spyOn(api, 'fetchRequesters').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    renderSelector()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to connect to toktickit api/i)
    })
  })

  it('lists only the active Requesters returned by the API and keeps Continue disabled until one is chosen', async () => {
    vi.spyOn(api, 'fetchRequesters').mockResolvedValue(ACTIVE_REQUESTERS)
    renderSelector()

    await waitFor(() => screen.getByLabelText(/development requester/i))

    for (const requester of ACTIVE_REQUESTERS) {
      expect(screen.getByText(new RegExp(requester.name))).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/development requester/i), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })
})

// UI-05: persists selection + header injection (AC-07, AC-08)
describe('RequesterSelector persistence and header injection', () => {
  it('persists the selected Requester so a fresh mount reads it back, and sends it as X-Requester-Id on later requests', async () => {
    vi.spyOn(api, 'fetchRequesters').mockResolvedValue(ACTIVE_REQUESTERS)
    renderSelector()

    await waitFor(() => screen.getByLabelText(/development requester/i))
    fireEvent.change(screen.getByLabelText(/development requester/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      const stored = window.localStorage.getItem('toktickit.requester')
      expect(stored && JSON.parse(stored).id).toBe(2)
    })

    // A fresh mount (simulating a page refresh) picks the persisted
    // selection straight back up, with no Selector shown.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    await api.fetchCategories()

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Requester-Id': '2' }) }),
    )
  })
})
