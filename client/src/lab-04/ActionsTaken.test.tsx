import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ActionsTaken from '../ActionsTaken'
import { ActionStatusBadge, FollowUpBadge } from '../badges'
import * as api from '../api'
import type { ActionTaken, EligibleOwner } from '../api'
import { IT_STAFF } from '../test/session'

const OWNERS: EligibleOwner[] = [
  { id: 20, name: 'Apinya Thongchai', role: 'ADMINISTRATOR' },
  { id: 31, name: 'Siriporn Kaewmanee', role: 'IT_STAFF' },
  { id: 12, name: 'Wichai Phromma', role: 'IT_STAFF' },
]

function action(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 88,
    actionAt: '2026-10-30T02:00:00.000Z',
    description: 'Check the laptop battery.',
    result: null,
    status: 'PLANNED',
    assignee: { id: 12, name: 'Wichai Phromma' },
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    createdBy: { id: 31, name: 'Siriporn Kaewmanee' },
    createdAt: '2026-10-30T02:10:00.000Z',
    version: 3,
    canEdit: true,
    ...overrides,
  }
}

const DONE = action({
  id: 89,
  description: 'Replaced the laptop battery.',
  result: 'Charge now holds for 7 hours.',
  status: 'DONE',
  followUpRequired: true,
  followUpNote: 'Check the charge again next week.',
  attachmentNotes: 'See battery-report.pdf.',
  canEdit: false,
})

const CANCELLED = action({ id: 90, description: 'Order a new charger.', status: 'CANCELLED', canEdit: false })

function renderStaff(
  overrides: { finishedAs?: 'closed' | 'cancelled'; owners?: EligibleOwner[]; onChanged?: () => void } = {},
) {
  return render(
    <ActionsTaken
      ticketId={42}
      finishedAs={overrides.finishedAs}
      staff={{ user: IT_STAFF, owners: overrides.owners ?? OWNERS, onChanged: overrides.onChanged ?? vi.fn() }}
    />,
  )
}

function renderRequester() {
  return render(<ActionsTaken ticketId={42} />)
}

function mockList(...actions: ActionTaken[]) {
  return vi.spyOn(api, 'fetchActionsTaken').mockResolvedValue(actions)
}

// The field a label names inside the open form.
function form() {
  return within(screen.getByRole('form', { name: /action/i }))
}

function changeField(label: string, value: string) {
  fireEvent.change(form().getByLabelText(label), { target: { value } })
}

async function openAdd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000

  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('UI-21: Action status and Follow-up badges', () => {
  it('labels each Action status in the style of ui-spec.md §2.2', () => {
    const { container } = render(
      <>
        <ActionStatusBadge status="PLANNED" />
        <ActionStatusBadge status="DONE" />
        <ActionStatusBadge status="CANCELLED" />
        <FollowUpBadge />
      </>,
    )

    expect(screen.getByText('Planned')).toHaveClass('tk-badge--info')
    expect(screen.getByText('Done')).toHaveClass('tk-badge--success')
    expect(screen.getByText('Done')).toHaveTextContent('✓')
    expect(screen.getByText('Cancelled')).toHaveClass('tk-badge--neutral', 'tk-badge--outlined')
    expect(screen.getByText('Follow-up')).toHaveClass('tk-badge--warning-outline')
    expect(container.querySelector('.tk-badge--warning-outline .tk-badge__icon')).toHaveTextContent('⚑')
  })
})

describe('UI-01: the card for staff', () => {
  it('shows the count, the caption, each row and its badges', async () => {
    mockList(DONE, action(), CANCELLED)
    renderStaff()

    expect(await screen.findByRole('heading', { name: 'Actions Taken (3)' })).toBeInTheDocument()
    expect(screen.getByText('Visible to the Requester and IT Staff.')).toBeInTheDocument()
    const row = screen.getByRole('button', { name: 'Replaced the laptop battery.' }).closest('tr')!
    expect(within(row).getByText('Done')).toBeInTheDocument()
    expect(within(row).getByText('Follow-up')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /laptop battery|new charger/ })).toHaveLength(3)
  })

  it('opens a row in place to show every field read-only', async () => {
    mockList(DONE)
    renderStaff()

    const disclosure = await screen.findByRole('button', { name: 'Replaced the laptop battery.' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(disclosure)

    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    const details = within(screen.getByRole('region', { name: 'Details of Replaced the laptop battery.' }))
    for (const [label, value] of [
      ['Action Description', 'Replaced the laptop battery.'],
      ['Result', 'Charge now holds for 7 hours.'],
      ['Performed by', 'Wichai Phromma'],
      ['Status', 'Done'],
      ['Follow-Up Required?', 'Yes'],
      ['Follow-up Note', 'Check the charge again next week.'],
      ['Attachment Notes', 'See battery-report.pdf.'],
      ['Created by', 'Siriporn Kaewmanee'],
    ]) {
      expect(details.getByText(label).nextElementSibling).toHaveTextContent(value)
    }
    expect(details.getByText('Action Date/Time')).toBeInTheDocument()
    expect(details.getByText('Created at')).toBeInTheDocument()

    fireEvent.click(disclosure)
    expect(screen.queryByRole('region', { name: /^Details of/ })).not.toBeInTheDocument()
  })

  it('moves to the card when the URL names it', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    window.history.replaceState({}, '', '/staff/tickets/42#actions-taken')
    mockList()
    const { container } = renderStaff()

    await screen.findByRole('heading', { name: 'Actions Taken (0)' })
    expect(container.querySelector('#actions-taken')).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

describe('UI-02: the create form', () => {
  beforeEach(() => {
    mockList()
    vi.spyOn(api, 'createActionTaken').mockResolvedValue(action())
  })

  it('opens with the defaults and moves focus to its first field', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-31T05:30:00.000Z'), toFake: ['Date'] })
    renderStaff()
    await openAdd()

    expect(form().getByLabelText('Date/Time')).toHaveValue(toLocalInput('2026-10-31T05:30:00.000Z'))
    expect(form().getByLabelText('Date/Time')).toHaveFocus()
    expect(form().getByLabelText('Status')).toHaveValue('PLANNED')
    expect(form().getByLabelText('Performed by')).toHaveValue('12')
    expect(form().queryByRole('option', { name: 'Cancelled' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('offers the eligible users, and the signed-in user when the list is missing', async () => {
    renderStaff({ owners: [] })
    await openAdd()

    expect(within(form().getByLabelText('Performed by')).getAllByRole('option')).toHaveLength(1)
    expect(form().getByRole('option', { name: 'Wichai Phromma' })).toBeInTheDocument()
  })

  it('shows field messages, focuses the first invalid field, and sends nothing', async () => {
    renderStaff()
    await openAdd()
    fireEvent.change(form().getByLabelText('Status'), { target: { value: 'DONE' } })
    fireEvent.click(form().getByRole('checkbox', { name: 'Follow-up required' }))
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(form().getByLabelText('Description')).toHaveAccessibleDescription(/required/i)
    expect(form().getByLabelText('Description')).toHaveFocus()
    expect(form().getByLabelText('Result')).toHaveAccessibleDescription(/required/i)
    expect(form().getByLabelText('Follow-up note')).toHaveAccessibleDescription(/required/i)
    expect(api.createActionTaken).not.toHaveBeenCalled()
  })

  it('refuses a Date/Time that is not a date and stays editable, with the typed data kept', async () => {
    renderStaff()
    await openAdd()
    changeField('Description', 'My typed text.')
    changeField('Date/Time', '20266-10-31T10:00')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(form().getByLabelText('Date/Time')).toHaveAccessibleDescription('Date/Time is not a valid date.')
    expect(form().getByLabelText('Date/Time')).toHaveFocus()
    expect(form().getByLabelText('Date/Time')).toHaveValue('20266-10-31T10:00')
    expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
    expect(form().getByLabelText('Description')).not.toHaveAttribute('readonly')
    expect(form().getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(api.createActionTaken).not.toHaveBeenCalled()
  })

  it('refuses text past the limits', async () => {
    renderStaff()
    await openAdd()
    changeField('Description', 'x'.repeat(2001))
    changeField('Attachment notes', 'x'.repeat(501))
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(form().getByLabelText('Description')).toHaveAccessibleDescription(/at most 2000/)
    expect(form().getByLabelText('Attachment notes')).toHaveAccessibleDescription(/at most 500/)
    expect(form().getByText('2001 / 2000')).toBeInTheDocument()
    expect(api.createActionTaken).not.toHaveBeenCalled()
  })

  it('hides and clears the note when Follow-up required is unchecked', async () => {
    renderStaff()
    await openAdd()
    const followUp = form().getByRole('checkbox', { name: 'Follow-up required' })
    fireEvent.click(followUp)
    changeField('Follow-up note', 'Check next week.')
    fireEvent.click(followUp)
    expect(form().queryByLabelText('Follow-up note')).not.toBeInTheDocument()
    fireEvent.click(followUp)
    expect(form().getByLabelText('Follow-up note')).toHaveValue('')

    fireEvent.click(followUp)
    changeField('Description', 'Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.createActionTaken).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.createActionTaken).mock.calls[0][1]).toMatchObject({
      followUpRequired: false,
      followUpNote: null,
    })
  })

  it('saves once, closes, announces, and reloads the list and the Ticket', async () => {
    const onChanged = vi.fn()
    renderStaff({ onChanged })
    await openAdd()
    fireEvent.change(form().getByLabelText('Performed by'), { target: { value: '31' } })
    changeField('Description', '  Check the battery.  ')
    changeField('Attachment notes', 'See battery-report.pdf.')
    vi.mocked(api.fetchActionsTaken).mockResolvedValue([action()])
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Action added.')).toBeInTheDocument()
    expect(api.createActionTaken).toHaveBeenCalledTimes(1)
    const [ticketId, sent] = vi.mocked(api.createActionTaken).mock.calls[0]
    expect(ticketId).toBe(42)
    expect(sent).toMatchObject({
      description: 'Check the battery.',
      status: 'PLANNED',
      assigneeId: 31,
      result: null,
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: 'See battery-report.pdf.',
    })
    expect(sent.clientRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.queryByRole('form', { name: /action/i })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Actions Taken (1)' })).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus())
  })

  it('closes on Cancel, sending nothing, and returns focus to Add', async () => {
    renderStaff()
    await openAdd()
    changeField('Description', 'Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('form', { name: /action/i })).not.toBeInTheDocument()
    expect(api.createActionTaken).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus())
  })

  it("shows the API's message under the field it names", async () => {
    vi.mocked(api.createActionTaken).mockRejectedValue(
      new api.ApiError(400, 'A Done action cannot be dated in the future.', 'VALIDATION_ERROR', 'actionAt'),
    )
    renderStaff()
    await openAdd()
    changeField('Description', 'Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(form().getByLabelText('Date/Time')).toHaveAccessibleDescription(
        'A Done action cannot be dated in the future.',
      ),
    )
    expect(form().getByLabelText('Description')).toHaveValue('Check the battery.')
  })
})

describe('UI-03: row buttons', () => {
  it('shows Edit, Mark Done, and Cancel action only on a canEdit Planned row', async () => {
    mockList(action(), action({ id: 91, description: 'Not mine.', canEdit: false }), DONE, CANCELLED)
    renderStaff()

    const rowOf = async (name: string) => (await screen.findByRole('button', { name })).closest('tr')!
    const planned = within(await rowOf('Check the laptop battery.'))
    expect(planned.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(planned.getByRole('button', { name: 'Mark Done' })).toBeInTheDocument()
    expect(planned.getByRole('button', { name: 'Cancel action' })).toBeInTheDocument()
    for (const name of ['Not mine.', 'Replaced the laptop battery.', 'Order a new charger.']) {
      expect(within(await rowOf(name)).queryByRole('button', { name: /Edit|Mark Done|Cancel action/ })).toBeNull()
    }
  })

  it('disables Add and the row buttons while a form is open', async () => {
    mockList(action(), action({ id: 91, description: 'Another.' }))
    renderStaff()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Done' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel action' })).toBeDisabled()
  })
})

describe('the edit form', () => {
  it('opens in place of the row with the saved values and sends the loaded version', async () => {
    const planned = action({ followUpRequired: true, followUpNote: 'Later.', attachmentNotes: 'See a.pdf.' })
    mockList(planned)
    vi.spyOn(api, 'updateActionTaken').mockResolvedValue(action({ version: 4 }))
    const onChanged = vi.fn()
    renderStaff({ onChanged })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.queryByRole('button', { name: 'Check the laptop battery.' })).not.toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('Check the laptop battery.')
    expect(form().getByLabelText('Date/Time')).toHaveFocus()
    expect(form().getByLabelText('Follow-up note')).toHaveValue('Later.')
    changeField('Description', 'Check it again.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Action updated.')).toBeInTheDocument()
    expect(api.updateActionTaken).toHaveBeenCalledWith(42, 88, {
      expectedVersion: 3,
      // The time was not touched: it goes back to the second.
      actionAt: '2026-10-30T02:00:00.000Z',
      description: 'Check it again.',
      result: null,
      status: 'PLANNED',
      assigneeId: 12,
      followUpRequired: true,
      followUpNote: 'Later.',
      attachmentNotes: 'See a.pdf.',
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus())
  })

  it('keeps an assignee who is no longer eligible, marked as such', async () => {
    mockList(action({ assignee: { id: 77, name: 'Former Staff' } }))
    renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(form().getByLabelText('Performed by')).toHaveValue('77')
    expect(form().getByRole('option', { name: 'Former Staff (no longer eligible)' })).toBeInTheDocument()
  })

  it('does not call an assignee ineligible while the eligible users are missing', async () => {
    mockList(action({ assignee: { id: 77, name: 'Former Staff' } }))
    renderStaff({ owners: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(form().getByRole('option', { name: 'Former Staff' })).toBeInTheDocument()
  })
})

describe('UI-04: Mark Done', () => {
  it('fixes Status at Done, requires Result, and focuses it', async () => {
    mockList(action())
    const done = { ...DONE, id: 88 }
    vi.spyOn(api, 'updateActionTaken').mockResolvedValue(done)
    renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Done' }))

    expect(form().getByLabelText('Status')).toHaveValue('DONE')
    expect(form().getByLabelText('Status')).toBeDisabled()
    expect(form().getByLabelText('Result')).toHaveFocus()

    fireEvent.click(form().getByRole('button', { name: 'Mark Done' }))
    expect(form().getByLabelText('Result')).toHaveAccessibleDescription(/required/i)
    expect(api.updateActionTaken).not.toHaveBeenCalled()

    changeField('Result', 'Holds a charge.')
    vi.mocked(api.fetchActionsTaken).mockResolvedValue([done])
    fireEvent.click(form().getByRole('button', { name: 'Mark Done' }))

    expect(await screen.findByText('Action marked Done.')).toBeInTheDocument()
    expect(vi.mocked(api.updateActionTaken).mock.calls[0][2]).toMatchObject({
      status: 'DONE',
      result: 'Holds a charge.',
      expectedVersion: 3,
    })
    // Its buttons are gone with the Planned status: focus stays on the row.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Replaced the laptop battery.' })).toHaveFocus(),
    )
  })

  it('replaces a future Date/Time by now', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-31T05:30:00.000Z'), toFake: ['Date'] })
    mockList(action({ actionAt: '2026-11-05T02:00:00.000Z' }))
    renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Done' }))

    expect(form().getByLabelText('Date/Time')).toHaveValue(toLocalInput('2026-10-31T05:30:00.000Z'))
  })
})

describe('UI-04: Cancel action', () => {
  const planned = action({ followUpRequired: true, followUpNote: 'Later.' })

  async function openConfirmation() {
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel action' }))

    return within(await screen.findByRole('dialog'))
  }

  beforeEach(() => {
    mockList(planned)
    vi.spyOn(api, 'updateActionTaken').mockResolvedValue(action({ status: 'CANCELLED', canEdit: false }))
  })

  it('sends nothing when dismissed', async () => {
    renderStaff()
    const dialog = await openConfirmation()

    expect(dialog.getByText(/It stays on the ticket as Cancelled and can no longer be changed\./)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Keep action' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.updateActionTaken).not.toHaveBeenCalled()
    expect(api.fetchActionsTaken).toHaveBeenCalledTimes(1)
  })

  it('sends the record unchanged with status CANCELLED', async () => {
    const onChanged = vi.fn()
    renderStaff({ onChanged })
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel action' }))

    expect(await screen.findByText('Action cancelled.')).toBeInTheDocument()
    expect(api.updateActionTaken).toHaveBeenCalledWith(42, 88, {
      expectedVersion: 3,
      actionAt: planned.actionAt,
      description: planned.description,
      result: null,
      status: 'CANCELLED',
      assigneeId: 12,
      followUpRequired: true,
      followUpNote: 'Later.',
      attachmentNotes: null,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('stays open on ACTION_TAKEN_CHANGED; Reload closes it and reloads the list', async () => {
    vi.mocked(api.updateActionTaken).mockRejectedValue(
      new api.ApiError(409, 'This action was changed by someone else.', 'ACTION_TAKEN_CHANGED'),
    )
    renderStaff()
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel action' }))

    expect(
      await dialog.findByText('This action was changed by someone else. Reload to see the latest version.'),
    ).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Reload' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.fetchActionsTaken).toHaveBeenCalledTimes(2))
  })

  it('can be confirmed again after a failure, and reloads the list on Keep action', async () => {
    vi.mocked(api.updateActionTaken).mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
    renderStaff()
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel action' }))

    expect(await dialog.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(dialog.queryByText(/Unable to connect/)).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Cancel action' })).toBeEnabled()

    fireEvent.click(dialog.getByRole('button', { name: 'Keep action' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.fetchActionsTaken).toHaveBeenCalledTimes(2))
  })

  it("shows the API's message for 403 and the Conflict notice for a final action, with no second try", async () => {
    vi.mocked(api.updateActionTaken).mockRejectedValueOnce(
      new api.ApiError(403, 'Only the creator can edit this action.', 'ACTION_TAKEN_EDIT_FORBIDDEN'),
    )
    renderStaff()
    const dialog = await openConfirmation()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel action' }))
    expect(await dialog.findByText('Only the creator can edit this action.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Cancel action' })).toBeDisabled()
    fireEvent.click(dialog.getByRole('button', { name: 'Keep action' }))

    vi.mocked(api.updateActionTaken).mockRejectedValueOnce(
      new api.ApiError(409, 'A Done or Cancelled action can no longer be changed.', 'ACTION_TAKEN_FINAL'),
    )
    const again = await openConfirmation()
    fireEvent.click(again.getByRole('button', { name: 'Cancel action' }))
    expect(await again.findByText(/This ticket was changed by someone else/)).toBeInTheDocument()
    expect(again.getByRole('button', { name: 'Cancel action' })).toBeDisabled()
  })
})

describe('UI-05: a stale edit', () => {
  async function saveStaleEdit() {
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    changeField('Description', 'My typed text.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))
  }

  beforeEach(() => {
    mockList(action())
    vi.spyOn(api, 'updateActionTaken').mockRejectedValue(
      new api.ApiError(409, 'This action was changed by someone else.', 'ACTION_TAKEN_CHANGED'),
    )
  })

  it('keeps the typed data under the Action conflict notice', async () => {
    renderStaff()
    await saveStaleEdit()

    expect(
      await form().findByText('This action was changed by someone else. Reload to see the latest version.'),
    ).toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
  })

  it('replaces the form with the latest version on Reload', async () => {
    renderStaff()
    await saveStaleEdit()
    await form().findByRole('button', { name: 'Reload' })
    vi.mocked(api.fetchActionsTaken).mockResolvedValue([action({ description: 'Their text.', version: 4 })])
    fireEvent.click(form().getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(form().getByLabelText('Description')).toHaveValue('Their text.'))
    expect(form().queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
    vi.mocked(api.updateActionTaken).mockResolvedValue(action({ version: 5 }))
    fireEvent.click(form().getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(vi.mocked(api.updateActionTaken).mock.lastCall?.[2].expectedVersion).toBe(4))
  })

  it('closes the form on Reload when the action is no longer Planned', async () => {
    renderStaff()
    await saveStaleEdit()
    await form().findByRole('button', { name: 'Reload' })
    vi.mocked(api.fetchActionsTaken).mockResolvedValue([action({ status: 'DONE', canEdit: false })])
    fireEvent.click(form().getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(screen.queryByRole('form', { name: /action/i })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Check the laptop battery.' })).toBeInTheDocument()
  })

  it('keeps the form and the typed data when Reload itself fails', async () => {
    renderStaff()
    await saveStaleEdit()
    await form().findByRole('button', { name: 'Reload' })
    vi.mocked(api.fetchActionsTaken).mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    fireEvent.click(form().getByRole('button', { name: 'Reload' }))

    expect(await form().findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
  })
})

describe('UI-06: a Finished Ticket', () => {
  it('offers no Add and no row buttons, and says why, while rows still open', async () => {
    mockList(action({ canEdit: false }))
    renderStaff({ finishedAs: 'closed' })

    const disclosure = await screen.findByRole('button', { name: 'Check the laptop battery.' })
    expect(screen.getByText('This ticket is closed. Its actions can no longer be changed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    fireEvent.click(disclosure)
    expect(screen.getByRole('region', { name: /^Details of/ })).toBeInTheDocument()
  })

  it('hides the row buttons as soon as the screen learns the Ticket finished', async () => {
    mockList(action())
    const { rerender } = renderStaff()
    await screen.findByRole('button', { name: 'Edit' })

    rerender(
      <ActionsTaken
        ticketId={42}
        finishedAs="cancelled"
        staff={{ user: IT_STAFF, owners: OWNERS, onChanged: vi.fn() }}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    await waitFor(() => expect(api.fetchActionsTaken).toHaveBeenCalledTimes(2))
  })

  it.each(['TICKET_FINISHED', 'ACTION_TAKEN_FINAL'])(
    'keeps the typed data and disables Save on %s',
    async (code) => {
      mockList(action())
      vi.spyOn(api, 'updateActionTaken').mockRejectedValue(new api.ApiError(409, 'Refused.', code))
      const onChanged = vi.fn()
      renderStaff({ onChanged })
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
      changeField('Description', 'My typed text.')
      fireEvent.click(form().getByRole('button', { name: 'Save' }))

      expect(await form().findByText(/This ticket was changed by someone else/)).toBeInTheDocument()
      expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
      expect(form().getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(onChanged).toHaveBeenCalledTimes(1)
    },
  )
})

describe('UI-07 and UI-22: one record from repeated saves', () => {
  beforeEach(() => {
    mockList()
  })

  it('sends one request for a double click on Save', async () => {
    let finish: (value: ActionTaken) => void = () => {}
    vi.spyOn(api, 'createActionTaken').mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderStaff()
    await openAdd()
    changeField('Description', 'Check the battery.')
    const save = form().getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    fireEvent.click(save)

    expect(api.createActionTaken).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('aria-busy', 'true')
    expect(form().getByLabelText('Description')).toHaveAttribute('readonly')
    expect(form().getByLabelText('Status')).toBeDisabled()

    await act(async () => finish(action()))
  })

  it('reuses the clientRequestId on a retry with the body unchanged, and keeps the typed data', async () => {
    vi.spyOn(api, 'createActionTaken')
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValueOnce(action())
    renderStaff()
    await openAdd()
    changeField('Description', 'Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await form().findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Action added.')).toBeInTheDocument()
    const [first, second] = vi.mocked(api.createActionTaken).mock.calls
    expect(second[1].clientRequestId).toBe(first[1].clientRequestId)
    expect(second[1].actionAt).toBe(first[1].actionAt)
  })

  it('generates a new clientRequestId once a field is edited after a failure', async () => {
    vi.spyOn(api, 'createActionTaken')
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValueOnce(action())
    renderStaff()
    await openAdd()
    changeField('Description', 'Check the battery.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))
    await form().findByText('Something went wrong. Please try again.')

    changeField('Description', 'Check the battery again.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    await screen.findByText('Action added.')
    const [first, second] = vi.mocked(api.createActionTaken).mock.calls
    expect(second[1].clientRequestId).not.toBe(first[1].clientRequestId)
  })
})

describe('UI-08: the card for a Requester', () => {
  it('lists every Action Taken read-only, and rows still open', async () => {
    mockList(DONE, action({ canEdit: false }), CANCELLED)
    renderRequester()

    const disclosure = await screen.findByRole('button', { name: 'Replaced the laptop battery.' })
    expect(screen.getByRole('heading', { name: 'Actions Taken (3)' })).toBeInTheDocument()
    expect(screen.getByText('Visible to you and IT Staff.')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    for (const name of ['Add', 'Edit', 'Mark Done', 'Cancel action']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()

    fireEvent.click(disclosure)
    expect(screen.getByText('Charge now holds for 7 hours.')).toBeInTheDocument()
  })

  it('shows no finished note', async () => {
    mockList()
    render(<ActionsTaken ticketId={42} finishedAs="closed" />)

    await screen.findByRole('heading', { name: 'Actions Taken (0)' })
    expect(screen.queryByText(/can no longer be changed/)).not.toBeInTheDocument()
  })
})

describe('UI-09: text from the API', () => {
  it('renders markup as literal text', async () => {
    const markup = '<img src=x onerror=alert(1)><script>alert(1)</script>'
    mockList(action({ description: markup, result: markup, followUpRequired: true, followUpNote: markup }))
    const { container } = renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: markup }))

    expect(container.querySelector('img, script')).toBeNull()
    expect(screen.getAllByText(markup).length).toBeGreaterThan(1)
  })
})

describe('UI-10: the states of the card', () => {
  it('shows skeleton rows while loading', () => {
    vi.spyOn(api, 'fetchActionsTaken').mockReturnValue(new Promise(() => {}))
    const { container } = renderStaff()

    expect(screen.getByRole('status')).toHaveTextContent('Loading actions…')
    expect(container.querySelector('.tk-skeleton')).toBeInTheDocument()
  })

  it('has empty text for each role', async () => {
    mockList()
    const { unmount } = renderStaff()
    expect(await screen.findByText('No actions recorded yet.')).toBeInTheDocument()
    unmount()

    renderRequester()
    expect(await screen.findByText('IT Staff have not recorded any actions yet.')).toBeInTheDocument()
  })

  it('offers Retry after a failed load, with no internal detail', async () => {
    const list = vi
      .spyOn(api, 'fetchActionsTaken')
      .mockRejectedValueOnce(new Error('Unable to connect to TokTickIT API'))
      .mockResolvedValueOnce([action()])
    renderStaff()

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: 'Check the laptop battery.' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument()
  })

  it.each([
    [403, 'You do not have access.'],
    [404, 'Ticket not found'],
  ])("shows the API's message for a %i on the list", async (status, message) => {
    vi.spyOn(api, 'fetchActionsTaken').mockRejectedValue(new api.ApiError(status, message))
    renderStaff()

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it.each([
    [403, 'Only the creator can edit this action.'],
    [404, 'Action not found'],
  ])("keeps the typed data under the API's message for a %i on save", async (status, message) => {
    mockList(action())
    vi.spyOn(api, 'updateActionTaken').mockRejectedValue(new api.ApiError(status, message))
    renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    changeField('Description', 'My typed text.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await form().findByText(message)).toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
  })

  it('never shows the text of a 500', async () => {
    mockList()
    vi.spyOn(api, 'createActionTaken').mockRejectedValue(new api.ApiError(500, 'relation does not exist'))
    renderStaff()
    await openAdd()
    changeField('Description', 'My typed text.')
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await form().findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
    expect(form().getByLabelText('Description')).toHaveValue('My typed text.')
  })

  it('keeps the rows when a reload after a save fails', async () => {
    mockList(action())
    vi.spyOn(api, 'updateActionTaken').mockResolvedValue(action({ version: 4 }))
    renderStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    vi.mocked(api.fetchActionsTaken).mockRejectedValue(new Error('Unable to connect to TokTickIT API'))
    fireEvent.click(form().getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check the laptop battery.' })).toBeInTheDocument()
  })

  it('loads the list again only when reloadSignal changes', async () => {
    const list = mockList(action())
    const { rerender } = render(<ActionsTaken ticketId={42} reloadSignal={0} />)
    await screen.findByRole('button', { name: 'Check the laptop battery.' })

    rerender(<ActionsTaken ticketId={42} reloadSignal={0} />)
    expect(list).toHaveBeenCalledTimes(1)

    list.mockResolvedValue([action(), DONE])
    rerender(<ActionsTaken ticketId={42} reloadSignal={1} />)

    expect(await screen.findByRole('button', { name: 'Replaced the laptop battery.' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
