import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateTicket from './CreateTicket'
import * as api from './api'

const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Wi-Fi' }]

const VALID_TICKET = {
  id: 42,
  ticketNumber: 'TKT-2026-000123',
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
  requestedPriority: 'MEDIUM' as const,
  itPriority: null,
  currentStatus: 'NEW',
  createdAt: '2026-08-23T10:15:00.000Z',
  updatedAt: '2026-08-23T10:15:00.000Z',
}

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue(CATEGORIES)
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue(RELATED_SYSTEMS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderForm() {
  render(<CreateTicket />)
  await waitFor(() => screen.getByLabelText(/^summary/i))
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText(/related system/i), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText(/requested priority/i), { target: { value: 'MEDIUM' } })
  fireEvent.change(screen.getByLabelText(/^summary/i), {
    target: { value: 'Laptop battery drains quickly' },
  })
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: 'My laptop battery is draining much faster than usual over the past week.' },
  })
}

describe('CreateTicket', () => {
  // UI-06 (AC-09): client-side validation blocks submission
  it('shows a field-level message for a missing Summary and does not call the API', async () => {
    const createSpy = vi.spyOn(api, 'createTicket')
    await renderForm()

    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/related system/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/requested priority/i), { target: { value: 'MEDIUM' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/summary is required/i)).toBeInTheDocument()
    })
    expect(createSpy).not.toHaveBeenCalled()
  })

  // UI-07 (AC-11): double-click on Submit only fires one create call
  it('fires only one create call when Submit is double-clicked', async () => {
    let resolveCreate!: (ticket: typeof VALID_TICKET) => void
    vi.spyOn(api, 'createTicket').mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    await renderForm()
    await fillValidForm()

    const submitButton = screen.getByRole('button', { name: /submit/i })
    fireEvent.click(submitButton)
    fireEvent.click(submitButton)

    expect(api.createTicket).toHaveBeenCalledTimes(1)
    expect(submitButton).toBeDisabled()

    resolveCreate(VALID_TICKET)
    await waitFor(() => screen.getByText(VALID_TICKET.ticketNumber))
  })

  // UI-08 (AC-12): submission failure shows a failure state and retains entered data
  it('shows a failure message and keeps entered field values when the API call fails', async () => {
    vi.spyOn(api, 'createTicket').mockRejectedValue(new Error('Unable to create ticket'))
    await renderForm()
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(/unable to create ticket/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/^summary/i)).toHaveValue('Laptop battery drains quickly')
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'My laptop battery is draining much faster than usual over the past week.',
    )
  })

  // UI-09 (AC-01): success renders the Ticket Number in a confirmation panel
  it('renders the Ticket Number in a confirmation panel on success', async () => {
    vi.spyOn(api, 'createTicket').mockResolvedValue(VALID_TICKET)
    await renderForm()
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(screen.getByText(VALID_TICKET.ticketNumber)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create another/i })).toBeInTheDocument()
  })

  // Attachment picker rejects an unsupported type before any upload is attempted.
  it('rejects an unsupported attachment type at selection time', async () => {
    const uploadSpy = vi.spyOn(api, 'uploadAttachment')
    await renderForm()

    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument()
    })
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  // BR-16/ADR-0003: selected attachments upload sequentially after Ticket
  // creation succeeds, one call awaited before the next starts.
  it('uploads selected attachments sequentially after the Ticket is created', async () => {
    vi.spyOn(api, 'createTicket').mockResolvedValue(VALID_TICKET)
    const callOrder: string[] = []
    let resolveFirst!: (attachment: unknown) => void
    vi.spyOn(api, 'uploadAttachment').mockImplementation((_ticketId, file: File) => {
      callOrder.push(`start:${file.name}`)
      if (file.name === 'a.png') {
        return new Promise((resolve) => {
          resolveFirst = () => {
            callOrder.push('end:a.png')
            resolve({
              id: 1,
              ticketId: VALID_TICKET.id,
              originalFilename: 'a.png',
              mimeType: 'image/png',
              sizeBytes: 10,
              createdAt: '2026-08-23T10:16:00.000Z',
            })
          }
        })
      }
      callOrder.push('end:b.png')
      return Promise.resolve({
        id: 2,
        ticketId: VALID_TICKET.id,
        originalFilename: 'b.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        createdAt: '2026-08-23T10:16:05.000Z',
      })
    })

    await renderForm()
    await fillValidForm()

    const fileA = new File(['a'], 'a.png', { type: 'image/png' })
    const fileB = new File(['b'], 'b.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [fileA, fileB] } })
    await waitFor(() => expect(screen.getByText('a.png')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => expect(callOrder).toEqual(['start:a.png']))
    resolveFirst(undefined)

    await waitFor(() => expect(screen.getByText(/2 of 2 attachments uploaded/i)).toBeInTheDocument())
    expect(callOrder).toEqual(['start:a.png', 'end:a.png', 'start:b.png', 'end:b.png'])
  })

  // BR-17/AC: one failed upload doesn't affect the Ticket or the other
  // upload; the confirmation view offers a per-file Retry that reuses the
  // same upload endpoint.
  it('shows a partial-success state with a working Retry when one attachment upload fails', async () => {
    vi.spyOn(api, 'createTicket').mockResolvedValue(VALID_TICKET)
    vi.spyOn(api, 'uploadAttachment').mockImplementation((_ticketId, file: File) => {
      if (file.name === 'bad.png') return Promise.reject(new Error('Server rejected this file'))
      return Promise.resolve({
        id: 1,
        ticketId: VALID_TICKET.id,
        originalFilename: file.name,
        mimeType: 'image/png',
        sizeBytes: 10,
        createdAt: '2026-08-23T10:16:00.000Z',
      })
    })

    await renderForm()
    await fillValidForm()

    const good = new File(['a'], 'good.png', { type: 'image/png' })
    const bad = new File(['b'], 'bad.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/attachments/i), { target: { files: [good, bad] } })
    await waitFor(() => expect(screen.getByText('bad.png')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => expect(screen.getByText(/1 of 2 attachments uploaded/i)).toBeInTheDocument())
    expect(screen.getByText(/server rejected this file/i)).toBeInTheDocument()

    vi.mocked(api.uploadAttachment).mockResolvedValueOnce({
      id: 2,
      ticketId: VALID_TICKET.id,
      originalFilename: 'bad.png',
      mimeType: 'image/png',
      sizeBytes: 10,
      createdAt: '2026-08-23T10:16:10.000Z',
    })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(screen.getByText(/2 of 2 attachments uploaded/i)).toBeInTheDocument())
  })
})
