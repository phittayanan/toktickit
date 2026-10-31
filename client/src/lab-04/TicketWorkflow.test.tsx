import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import * as api from '../api'
import type { StaffTicket, TicketStatus } from '../api'
import { IT_STAFF, openPath, signedInAs } from '../test/session'

// An In Progress Ticket owned by the signed-in IT Staff user, gate unmet.
function ticket(overrides: Partial<StaffTicket> = {}): StaffTicket {
  return {
    id: 42,
    ticketNumber: 'TKT-2026-000123',
    summary: 'Laptop battery drains quickly',
    description: 'The battery goes from full to empty.',
    requester: { id: 7, name: 'Somchai Jaidee', email: 'somchai.jaidee@kmutt.ac.th', isActive: true },
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 5, name: 'Printing' },
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'IN_PROGRESS',
    allowedTransitions: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    owner: { id: 12, name: 'Wichai Phromma' },
    ownerChangedAt: '2026-10-01T04:00:00.000Z',
    resolutionSummary: null,
    resolvedAt: null,
    requesterResolvedAt: null,
    publicCommentCount: 0,
    internalNoteCount: 0,
    actionTakenCounts: { planned: 0, done: 0 },
    attachments: [],
    createdAt: '2026-10-01T02:15:00.000Z',
    updatedAt: '2026-10-02T03:15:00.000Z',
    ...overrides,
  }
}

const gateMet = { actionTakenCounts: { planned: 0, done: 1 } }

beforeEach(() => {
  vi.spyOn(api, 'fetchEligibleOwners').mockResolvedValue([])
  vi.spyOn(api, 'fetchPublicComments').mockResolvedValue([])
  vi.spyOn(api, 'fetchInternalNotes').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function openDetail(loaded: StaffTicket) {
  const fetchStaffTicket = vi.spyOn(api, 'fetchStaffTicket').mockResolvedValue(loaded)
  signedInAs(IT_STAFF)
  openPath('/staff/tickets/42')
  render(<App />)
  await screen.findByRole('heading', { name: 'Manage this ticket' })

  return fetchStaffTicket
}

const operations = () => within(screen.getByRole('region', { name: 'Manage this ticket' }))
const statusSelect = () => operations().getByLabelText('Current Status') as HTMLSelectElement
const option = (name: string) => within(statusSelect()).getByRole('option', { name }) as HTMLOptionElement
const optionNames = () => within(statusSelect()).getAllByRole('option').map((item) => item.textContent)
const updateStatus = () => operations().getByRole('button', { name: 'Update Status' })
const choose = (status: TicketStatus) => fireEvent.change(statusSelect(), { target: { value: status } })

describe('the Ticket status control', () => {
  // UI-11 (AC-25)
  it.each([
    [{ planned: 0, done: 0 }, 'Done: 0. Planned: 0.'],
    [{ planned: 2, done: 0 }, 'Done: 0. Planned: 2.'],
    [{ planned: 1, done: 3 }, 'Done: 3. Planned: 1.'],
  ])('with counts %j lists Resolved disabled, with the reason tied to the select', async (actionTakenCounts, counts) => {
    await openDetail(ticket({ actionTakenCounts }))

    expect(option('Resolved (not available)').disabled).toBe(true)
    expect(optionNames()).toEqual(['Choose a new status…', 'Waiting for Requester', 'Resolved (not available)', 'Cancelled'])

    const reason = operations().getByText(`Resolved needs at least one Done action and no Planned actions. ${counts}`)
    expect(statusSelect()).toHaveAttribute('aria-describedby', reason.id)
  })

  // UI-11 (AC-25)
  it('links the reason to the Actions Taken card, moving focus to it', async () => {
    await openDetail(ticket())
    const card = document.createElement('section')
    card.id = 'actions-taken'
    card.tabIndex = -1
    document.body.appendChild(card)

    fireEvent.click(operations().getByRole('link', { name: 'Go to Actions Taken' }))

    expect(card).toHaveFocus()
    card.remove()
  })

  // UI-11 (AC-25): a gate that does not apply to this status.
  it('says nothing of the gate when Resolved is not a transition from this status', async () => {
    await openDetail(ticket({ currentStatus: 'OPEN', allowedTransitions: ['IN_PROGRESS', 'CANCELLED'] }))

    expect(optionNames()).toEqual(['Choose a new status…', 'In Progress', 'Cancelled'])
    expect(operations().queryByText(/Resolved needs/)).not.toBeInTheDocument()
    expect(statusSelect()).not.toHaveAttribute('aria-describedby')
  })

  // UI-12 (AC-25)
  it('with the gate met offers Resolved as a normal option that opens the Lab 3 dialog', async () => {
    await openDetail(ticket(gateMet))

    expect(option('Resolved').disabled).toBe(false)
    expect(operations().queryByText(/Resolved needs/)).not.toBeInTheDocument()
    expect(operations().queryByRole('link', { name: 'Go to Actions Taken' })).not.toBeInTheDocument()

    choose('RESOLVED')
    fireEvent.click(updateStatus())

    expect(await screen.findByRole('dialog', { name: 'Resolve TKT-2026-000123' })).toBeInTheDocument()
  })

  // UI-12 (AC-25)
  it('keeps the no-owner branch of the dialog', async () => {
    await openDetail(ticket({ ...gateMet, owner: null, ownerChangedAt: null }))

    choose('RESOLVED')
    fireEvent.click(updateStatus())

    const dialog = within(await screen.findByRole('dialog', { name: 'Resolve TKT-2026-000123' }))
    expect(dialog.getByText('A ticket needs an owner before it can be resolved.')).toBeInTheDocument()
  })

  // UI-12 (AC-25)
  it('after a save refreshes the summary status and offers the next transitions only', async () => {
    await openDetail(ticket(gateMet))
    vi.spyOn(api, 'updateTicketStatus').mockResolvedValue(
      ticket({
        ...gateMet,
        currentStatus: 'WAITING_FOR_REQUESTER',
        allowedTransitions: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
      }),
    )

    choose('WAITING_FOR_REQUESTER')
    fireEvent.click(updateStatus())

    expect(await operations().findByRole('status')).toHaveTextContent('Status changed to Waiting for Requester.')
    expect(within(screen.getByRole('group', { name: 'Ticket status' })).getByText('Waiting for Requester')).toBeInTheDocument()
    expect(optionNames()).toEqual(['Choose a new status…', 'In Progress', 'Resolved', 'Cancelled'])
  })

  // UI-12 (AC-25)
  it('clears the reason once a reload shows the gate is met', async () => {
    const fetchStaffTicket = await openDetail(ticket())
    expect(operations().getByText(/Resolved needs/)).toBeInTheDocument()

    fetchStaffTicket.mockResolvedValue(ticket(gateMet))
    vi.spyOn(api, 'updateItPriority').mockRejectedValue(new api.ApiError(409, 'Changed', 'STATUS_CHANGED'))
    fireEvent.change(operations().getByLabelText('IT Priority'), { target: { value: 'LOW' } })
    fireEvent.click(operations().getByRole('button', { name: 'Update Priority' }))

    await waitFor(() => expect(operations().queryByText(/Resolved needs/)).not.toBeInTheDocument())
    expect(option('Resolved').disabled).toBe(false)
  })

  // UI-13 (AC-16, AC-17)
  it.each(['DONE_ACTION_REQUIRED', 'PLANNED_ACTION_REMAINS'])(
    'a stale screen answered %s shows the Conflict notice and reloads the Ticket',
    async (code) => {
      const fetchStaffTicket = await openDetail(ticket(gateMet))
      vi.spyOn(api, 'updateTicketStatus').mockRejectedValue(new api.ApiError(409, 'Refused', code))
      fetchStaffTicket.mockResolvedValue(ticket({ actionTakenCounts: { planned: 1, done: 1 } }))

      choose('RESOLVED')
      fireEvent.click(updateStatus())
      const dialog = within(await screen.findByRole('dialog', { name: 'Resolve TKT-2026-000123' }))
      fireEvent.change(dialog.getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } })
      fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))

      expect(await operations().findByText(/Resolved needs/)).toHaveTextContent('Done: 1. Planned: 1.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(operations().getByRole('alert')).toBeInTheDocument()
      expect(fetchStaffTicket).toHaveBeenCalledTimes(2)
    },
  )

  // Opens the dialog and answers its summary with PLANNED_ACTION_REMAINS, the
  // reload showing the gate unmet.
  async function refuseSummary(fetchStaffTicket: Awaited<ReturnType<typeof openDetail>>) {
    const updateTicketStatus = vi
      .spyOn(api, 'updateTicketStatus')
      .mockRejectedValue(new api.ApiError(409, 'Refused', 'PLANNED_ACTION_REMAINS'))
    fetchStaffTicket.mockResolvedValue(ticket({ actionTakenCounts: { planned: 1, done: 1 } }))

    choose('RESOLVED')
    fireEvent.click(updateStatus())
    const dialog = within(await screen.findByRole('dialog', { name: 'Resolve TKT-2026-000123' }))
    fireEvent.change(dialog.getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))
    await operations().findByText(/Resolved needs/)

    return updateTicketStatus
  }

  // An in-place reload that shows the gate met again.
  async function meetGateAgain(fetchStaffTicket: Awaited<ReturnType<typeof openDetail>>) {
    fetchStaffTicket.mockResolvedValue(ticket(gateMet))
    vi.spyOn(api, 'updateItPriority').mockRejectedValue(new api.ApiError(409, 'Changed', 'STATUS_CHANGED'))
    fireEvent.change(operations().getByLabelText('IT Priority'), { target: { value: 'LOW' } })
    fireEvent.click(operations().getByRole('button', { name: 'Update Priority' }))
    await waitFor(() => expect(option('Resolved').disabled).toBe(false))
  }

  async function reopenDialog() {
    choose('RESOLVED')
    fireEvent.click(updateStatus())

    return within(await screen.findByRole('dialog', { name: 'Resolve TKT-2026-000123' }))
  }

  // BR-35
  it('shows a refused Resolution Summary again when the gate is next met', async () => {
    const fetchStaffTicket = await openDetail(ticket(gateMet))
    await refuseSummary(fetchStaffTicket)

    await meetGateAgain(fetchStaffTicket)

    expect((await reopenDialog()).getByLabelText(/Resolution Summary/)).toHaveValue('Replaced the battery.')
  })

  // BR-35: Cancel still discards what was typed.
  it('forgets a refused Resolution Summary once its dialog is cancelled', async () => {
    const fetchStaffTicket = await openDetail(ticket(gateMet))
    await refuseSummary(fetchStaffTicket)
    await meetGateAgain(fetchStaffTicket)

    fireEvent.click((await reopenDialog()).getByRole('button', { name: 'Cancel' }))

    expect((await reopenDialog()).getByLabelText(/Resolution Summary/)).toHaveValue('')
  })

  // BR-35: a summary that was saved is not the next resolve's draft.
  it('forgets a refused Resolution Summary once it is saved', async () => {
    const fetchStaffTicket = await openDetail(ticket(gateMet))
    const updateTicketStatus = await refuseSummary(fetchStaffTicket)
    await meetGateAgain(fetchStaffTicket)
    updateTicketStatus.mockResolvedValue(ticket({ ...gateMet, allowedTransitions: ['WAITING_FOR_REQUESTER', 'RESOLVED'] }))

    fireEvent.click((await reopenDialog()).getByRole('button', { name: 'Mark as Resolved' }))
    await operations().findByRole('status')

    expect((await reopenDialog()).getByLabelText(/Resolution Summary/)).toHaveValue('')
  })

  // Answers the summary with OWNER_REQUIRED, the reload showing no owner, and
  // opens the dialog again on its "needs an owner" branch.
  async function refuseForNoOwner() {
    const fetchStaffTicket = await openDetail(ticket(gateMet))
    vi.spyOn(api, 'updateTicketStatus').mockRejectedValue(new api.ApiError(409, 'Refused', 'OWNER_REQUIRED'))
    fetchStaffTicket.mockResolvedValue(ticket({ ...gateMet, owner: null, ownerChangedAt: null }))
    vi.spyOn(api, 'updateTicketOwner').mockResolvedValue(ticket(gateMet))

    const dialog = await reopenDialog()
    fireEvent.change(dialog.getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as Resolved' }))
    await operations().findByRole('button', { name: 'Claim' })

    const noOwner = await reopenDialog()
    expect(noOwner.getByText('A ticket needs an owner before it can be resolved.')).toBeInTheDocument()

    return noOwner
  }

  // BR-35: the no-owner dialog never showed the summary, so leaving it keeps it.
  it.each([
    ['Cancel', (dialog: Awaited<ReturnType<typeof reopenDialog>>) => fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('keeps a refused Resolution Summary when %s leaves the no-owner dialog', async (_how, leave) => {
    leave(await refuseForNoOwner())

    fireEvent.click(operations().getByRole('button', { name: 'Claim' }))
    await operations().findByText('Owner updated.')

    expect((await reopenDialog()).getByLabelText(/Resolution Summary/)).toHaveValue('Replaced the battery.')
  })

  // BR-35
  it('shows a refused Resolution Summary once Claim in the dialog gives the Ticket an owner', async () => {
    const dialog = await refuseForNoOwner()

    fireEvent.click(dialog.getByRole('button', { name: 'Claim' }))

    expect(await dialog.findByLabelText(/Resolution Summary/)).toHaveValue('Replaced the battery.')
  })
})
