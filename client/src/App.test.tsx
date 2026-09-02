import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './api'

const SEEDED_REQUESTERS = [{ id: 1, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th' }]

const SEEDED_CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
]

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function selectRequester() {
  vi.spyOn(api, 'fetchRequesters').mockResolvedValue(SEEDED_REQUESTERS)
  render(<App />)
  await waitFor(() => screen.getByLabelText(/development requester/i))
  fireEvent.change(screen.getByLabelText(/development requester/i), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => screen.getByRole('heading', { name: /toktickit it service desk/i }))
}

describe('App', () => {
  // AC-02: no Requester selected yet -> the Selector is shown
  it('shows the Requester Selector before a Requester is chosen', async () => {
    vi.spyOn(api, 'fetchRequesters').mockResolvedValue(SEEDED_REQUESTERS)
    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText(/development requester/i)).toBeInTheDocument()
    })
  })

  // AC-01 (shell): selecting a Requester reveals the app shell with their
  // name and a Change Requester action reachable from the screen.
  it('shows the app shell with the selected Requester and a Change Requester action after selection', async () => {
    await selectRequester()

    expect(screen.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change requester/i })).toBeInTheDocument()
  })

  it('returns to the Requester Selector when Change Requester is clicked', async () => {
    await selectRequester()

    fireEvent.click(screen.getByRole('button', { name: /change requester/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/development requester/i)).toBeInTheDocument()
    })
  })

  // UI-02 (Lab 1, still valid inside the shell): loading state -> Online + category list
  it('shows a loading state, then Online status and the category list on success', async () => {
    await selectRequester()
    vi.spyOn(api, 'checkHealth').mockResolvedValue({ status: 'ok', service: 'TokTickIT API' })
    vi.spyOn(api, 'fetchCategories').mockResolvedValue(SEEDED_CATEGORIES)

    fireEvent.click(screen.getByRole('button', { name: /check system/i }))

    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/system status: online/i)).toBeInTheDocument()
    })

    for (const category of SEEDED_CATEGORIES) {
      expect(screen.getByText(category.name)).toBeInTheDocument()
    }
  })

  // UI-03 (Lab 1, still valid inside the shell): API failure shows a useful error message
  it('shows an error message when the API is unavailable', async () => {
    await selectRequester()
    vi.spyOn(api, 'checkHealth').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))

    fireEvent.click(screen.getByRole('button', { name: /check system/i }))

    await waitFor(() => {
      expect(screen.getByText(/system status: offline/i)).toBeInTheDocument()
      expect(screen.getByText(/unable to connect to toktickit api/i)).toBeInTheDocument()
    })
  })
})
