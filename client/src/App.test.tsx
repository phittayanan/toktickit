import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

// UI-01: TokTickIT heading renders
describe('App', () => {
  it('renders the TokTickIT heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /TokTickIT IT Service Desk/i })).toBeInTheDocument()
  })

  // UI-02: Loading state changes to a result (success here)
  it('shows a loading state, then Online status on success', async () => {
    vi.spyOn(api, 'checkHealth').mockResolvedValue({ status: 'ok', service: 'TokTickIT API' })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /check system/i }))

    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/system status: online/i)).toBeInTheDocument()
    })
  })

  // UI-03: API failure displays a useful error message
  it('shows an error message when the API is unavailable', async () => {
    vi.spyOn(api, 'checkHealth').mockRejectedValue(new Error('Unable to connect to TokTickIT API'))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /check system/i }))

    await waitFor(() => {
      expect(screen.getByText(/system status: offline/i)).toBeInTheDocument()
      expect(screen.getByText(/unable to connect to toktickit api/i)).toBeInTheDocument()
    })
  })
})
