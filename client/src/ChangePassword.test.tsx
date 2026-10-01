import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import * as api from './api'
import { IT_STAFF, openPath, REQUESTER, signedInAs } from './test/session'

const MUST_CHANGE = { ...REQUESTER, mustChangePassword: true }
const CURRENT = 'TokTickIT-Lab3!'
const VALID_NEW = 'Bright-Kettle-42'

beforeEach(() => {
  vi.spyOn(api, 'fetchCategories').mockResolvedValue([{ id: 1, name: 'Hardware' }])
  vi.spyOn(api, 'fetchRelatedSystems').mockResolvedValue([{ id: 1, name: 'Wi-Fi' }])
  vi.spyOn(api, 'fetchTickets').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
  vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
  vi.spyOn(api, 'fetchEligibleOwners').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mandatory mode: the signed-in user must change their password.
async function openMandatory() {
  signedInAs(MUST_CHANGE)
  openPath('/change-password')
  render(<App />)
  await screen.findByRole('heading', { name: 'Change Password' })
}

const currentField = () => screen.getByLabelText(/^Current( \(temporary\))? password$/)
const newField = () => screen.getByLabelText('New password')
const confirmField = () => screen.getByLabelText('Confirm new password')

function typePasswords(current: string, next: string, confirm: string) {
  fireEvent.change(currentField(), { target: { value: current } })
  fireEvent.change(newField(), { target: { value: next } })
  fireEvent.change(confirmField(), { target: { value: confirm } })
}

function checklist() {
  const panel = within(screen.getByRole('group', { name: 'Password must:' }))
  return panel.getAllByRole('listitem').map((line) => line.textContent)
}

describe('Change Password checklist and validation', () => {
  // UI-04 (AC-08): typing updates the checklist
  it('flips each checklist line as the new password comes to meet its rule', async () => {
    await openMandatory()

    expect(checklist()).toEqual([
      'Not met: Be at least 8 characters',
      'Not met: Include upper and lower case letters',
      'Not met: Include a number',
      'Not met: Include a special character',
    ])

    fireEvent.change(newField(), { target: { value: 'brightkettle' } })
    expect(checklist()).toEqual([
      'Met: Be at least 8 characters',
      'Not met: Include upper and lower case letters',
      'Not met: Include a number',
      'Not met: Include a special character',
    ])

    fireEvent.change(newField(), { target: { value: 'Bk4' } })
    expect(checklist()).toEqual([
      'Not met: Be at least 8 characters',
      'Met: Include upper and lower case letters',
      'Met: Include a number',
      'Not met: Include a special character',
    ])

    fireEvent.change(newField(), { target: { value: VALID_NEW } })
    expect(checklist()).toEqual([
      'Met: Be at least 8 characters',
      'Met: Include upper and lower case letters',
      'Met: Include a number',
      'Met: Include a special character',
    ])
  })

  // UI-04 (AC-08): submit with an unmet rule, a mismatch, and a reused
  // password -> field messages, no call
  it.each([
    {
      name: 'a missing current password',
      values: ['', VALID_NEW, VALID_NEW],
      field: currentField,
      message: 'Current password is required.',
    },
    {
      name: 'a missing new password',
      values: [CURRENT, '', ''],
      field: newField,
      message: 'New password is required.',
    },
    {
      name: 'a new password under 8 characters',
      values: [CURRENT, 'Bk-4', 'Bk-4'],
      field: newField,
      message: 'Password must be at least 8 characters.',
    },
    {
      name: 'a new password without both letter cases',
      values: [CURRENT, 'bright-kettle-42', 'bright-kettle-42'],
      field: newField,
      message: 'Password must include upper and lower case letters.',
    },
    {
      name: 'a new password without a number',
      values: [CURRENT, 'Bright-Kettle', 'Bright-Kettle'],
      field: newField,
      message: 'Password must include a number.',
    },
    {
      name: 'a new password without a special character',
      values: [CURRENT, 'BrightKettle42', 'BrightKettle42'],
      field: newField,
      message: 'Password must include a special character.',
    },
    {
      name: 'a new password over 72 characters',
      values: [CURRENT, `Bk-4${'x'.repeat(69)}`, `Bk-4${'x'.repeat(69)}`],
      field: newField,
      message: 'Password must be at most 72 characters.',
    },
    {
      name: 'a new password equal to the current one',
      values: [CURRENT, CURRENT, CURRENT],
      field: newField,
      message: 'New password must differ from the current password.',
    },
    {
      name: 'a missing confirmation',
      values: [CURRENT, VALID_NEW, ''],
      field: confirmField,
      message: 'Confirm the new password.',
    },
    {
      name: 'a confirmation that differs',
      values: [CURRENT, VALID_NEW, 'Bright-Kettle-43'],
      field: confirmField,
      message: 'Confirmation does not match the new password.',
    },
  ])('shows "$message" under its field for $name and sends no request', async ({ values, field, message }) => {
    const changePassword = vi.spyOn(api, 'changePassword')
    await openMandatory()

    typePasswords(values[0], values[1], values[2])
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(field()).toBeInvalid()
    expect(field()).toHaveAccessibleDescription(message)
    expect(field()).toHaveFocus()
    expect(changePassword).not.toHaveBeenCalled()
  })

  // A field's message goes once that field is edited; the others stay
  it("clears a field's message when that field is edited", async () => {
    await openMandatory()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(currentField()).toBeInvalid()

    fireEvent.change(currentField(), { target: { value: CURRENT } })

    expect(currentField()).toBeValid()
    expect(screen.queryByText('Current password is required.')).not.toBeInTheDocument()
    expect(newField()).toHaveAccessibleDescription('New password is required.')
  })

  // ui-spec.md §6: the first invalid field takes focus
  it('shows every field message and focuses the first invalid field', async () => {
    const changePassword = vi.spyOn(api, 'changePassword')
    await openMandatory()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(currentField()).toHaveAccessibleDescription('Current password is required.')
    expect(newField()).toHaveAccessibleDescription('New password is required.')
    expect(confirmField()).toHaveAccessibleDescription('Confirm the new password.')
    expect(currentField()).toHaveFocus()
    expect(changePassword).not.toHaveBeenCalled()
  })
})

describe('Change Password, mandatory mode', () => {
  // UI-05 (AC-02): layout -> no navigation, no Cancel
  it('shows only the wordmark and Logout in the header, with no navigation and no Cancel', async () => {
    await openMandatory()

    expect(screen.getByText('You must change your password to continue.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current (temporary) password')).toHaveAttribute('autocomplete', 'current-password')
    expect(newField()).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmField()).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    const header = within(screen.getByRole('banner'))
    expect(header.getByText('TokTickIT')).toBeInTheDocument()
    expect(header.getAllByRole('button').map((button) => button.textContent)).toEqual(['Logout'])
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  // BR-02: logout stays available while the password must be changed
  it('logs out from the mandatory screen', async () => {
    const logout = vi.spyOn(api, 'logout').mockResolvedValue()
    await openMandatory()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeInTheDocument()
    expect(logout).toHaveBeenCalledTimes(1)
  })

  // UI-05 (AC-08): wrong current password
  it('shows "Current password is incorrect." under Current password and keeps the other fields', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(
      new api.ApiError(400, 'Current password is incorrect.', 'VALIDATION_ERROR', 'currentPassword'),
    )
    await openMandatory()

    typePasswords('Wrong-Current-1', VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(currentField()).toHaveAccessibleDescription('Current password is incorrect.'))
    expect(currentField()).toHaveFocus()
    expect(newField()).toHaveValue(VALID_NEW)
    expect(confirmField()).toHaveValue(VALID_NEW)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
  })

  // UI-05: another server 400 -> the API's message under the field it names
  it.each([
    { field: 'newPassword', input: newField, message: 'Password must be at most 72 bytes.' },
    { field: 'confirmPassword', input: confirmField, message: 'Confirmation does not match the new password.' },
  ])("shows the API's message under $field when a 400 names it", async ({ field, input, message }) => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(new api.ApiError(400, message, 'VALIDATION_ERROR', field))
    await openMandatory()

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(input()).toHaveAccessibleDescription(message))
    expect(currentField()).toHaveValue(CURRENT)
  })

  // UI-05 (AC-52): network failure -> safe failure with values kept
  it.each([
    { failure: new Error('Unable to connect to TokTickIT API'), name: 'a lost connection' },
    { failure: new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR'), name: 'a 500' },
  ])('shows the safe failure alert and keeps every value after $name', async ({ failure }) => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(failure)
    await openMandatory()

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(currentField()).toHaveValue(CURRENT)
    expect(newField()).toHaveValue(VALID_NEW)
    expect(confirmField()).toHaveValue(VALID_NEW)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  // ui-spec.md §6: Submitting -> button busy and disabled
  it('shows Continue busy and disabled while the request is pending', async () => {
    const changePassword = vi.spyOn(api, 'changePassword').mockReturnValue(new Promise(() => {}))
    await openMandatory()

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.submit(button.closest('form')!)
    expect(changePassword).toHaveBeenCalledTimes(1)
  })

  // UI-05 (AC-09): success -> landing screen with the notice
  it.each([
    { user: REQUESTER, landing: '/tickets' },
    { user: IT_STAFF, landing: '/staff/queue' },
  ])('opens the $user.role landing screen with "Password changed." after a valid change', async ({ user, landing }) => {
    const changePassword = vi.spyOn(api, 'changePassword').mockResolvedValue(user)
    signedInAs({ ...user, mustChangePassword: true })
    openPath('/change-password')
    render(<App />)
    await screen.findByRole('heading', { name: 'Change Password' })

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.')
    expect(window.location.pathname).toBe(landing)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(changePassword).toHaveBeenCalledTimes(1)
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: VALID_NEW,
      confirmPassword: VALID_NEW,
    })
  })
})

describe('Change Password, voluntary mode', () => {
  // Opens Change Password from the user menu while on Create Ticket.
  async function openFromUserMenu() {
    signedInAs(REQUESTER)
    openPath('/tickets/new')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change Password' }))
    await screen.findByRole('heading', { name: 'Change Password' })
  }

  // UI-06 (AC-09): inside the shell with Cancel
  it('opens inside the shell from the user menu, with Cancel and a Change Password button', async () => {
    await openFromUserMenu()

    expect(window.location.pathname).toBe('/change-password')
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Somchai Jaidee/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change Password' })).toHaveAttribute('type', 'submit')
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.queryByText('You must change your password to continue.')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // UI-06: Cancel returns to the previous screen
  it('returns to the previous screen on Cancel without sending a request', async () => {
    const changePassword = vi.spyOn(api, 'changePassword')
    await openFromUserMenu()
    typePasswords(CURRENT, VALID_NEW, VALID_NEW)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.pathname).toBe('/tickets/new'))
    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // UI-06 (AC-09): success returns with the notice
  it('returns to the previous screen with "Password changed." after a valid change', async () => {
    const changePassword = vi.spyOn(api, 'changePassword').mockResolvedValue(REQUESTER)
    await openFromUserMenu()

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))

    expect(await screen.findByText('Password changed.')).toHaveAttribute('role', 'status')
    expect(window.location.pathname).toBe('/tickets/new')
    // Create Ticket shows its form once its reference data has loaded.
    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: VALID_NEW,
      confirmPassword: VALID_NEW,
    })
  })

  // Opened by its URL there is no previous screen: the landing screen is used
  it('returns to the landing screen on Cancel when opened directly', async () => {
    signedInAs(IT_STAFF)
    openPath('/change-password')
    render(<App />)
    await screen.findByRole('heading', { name: 'Change Password' })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.pathname).toBe('/staff/queue'))
  })

  // Chosen again from the user menu while already open.
  function openAgainFromUserMenu(name: RegExp) {
    fireEvent.click(screen.getByRole('button', { name }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change Password' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
  }

  // The return path never names Change Password itself
  it('still returns to the previous screen on Cancel after it is opened again from the user menu', async () => {
    await openFromUserMenu()
    openAgainFromUserMenu(/Somchai Jaidee/)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.pathname).toBe('/tickets/new'))
    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
  })

  it('still returns to the previous screen after a valid change when opened again from the user menu', async () => {
    vi.spyOn(api, 'changePassword').mockResolvedValue(REQUESTER)
    await openFromUserMenu()
    openAgainFromUserMenu(/Somchai Jaidee/)

    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))

    expect(await screen.findByText('Password changed.')).toHaveAttribute('role', 'status')
    expect(window.location.pathname).toBe('/tickets/new')
    // Create Ticket shows its form once its reference data has loaded.
    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Change Password' })).not.toBeInTheDocument()
  })

  it('still returns to the landing screen on Cancel when opened directly and then again from the user menu', async () => {
    signedInAs(IT_STAFF)
    openPath('/change-password')
    render(<App />)
    await screen.findByRole('heading', { name: 'Change Password' })
    openAgainFromUserMenu(/Wichai Phromma/)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(window.location.pathname).toBe('/staff/queue'))
  })
})

describe('"Password changed." notice', () => {
  // A valid voluntary change made from Create Ticket, which shows the notice.
  async function changePasswordFromCreateTicket() {
    vi.spyOn(api, 'changePassword').mockResolvedValue(REQUESTER)
    signedInAs(REQUESTER)
    openPath('/tickets/new')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Somchai Jaidee/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change Password' }))
    await screen.findByRole('heading', { name: 'Change Password' })
    typePasswords(CURRENT, VALID_NEW, VALID_NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/tickets/new')
  }

  // The notice confirms the change just made, so a reload does not repeat it
  it('is not shown again when the page is reloaded', async () => {
    await changePasswordFromCreateTicket()

    cleanup()
    render(<App />)

    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/tickets/new')
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
  })

  // Nor does Back to the screen it was shown on
  it('goes on leaving the screen and is not shown again on coming back to it', async () => {
    await changePasswordFromCreateTicket()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'My Tickets' }))
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()

    window.history.back()

    expect(await screen.findByLabelText(/^summary/i)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/tickets/new')
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument()
  })
})
