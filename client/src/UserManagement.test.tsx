import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import UserManagement from './UserManagement'
import * as api from './api'
import type { AdminUser } from './api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedInAs, emptyDashboards } from './test/session'

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 12,
    name: 'Wichai Phromma',
    email: 'wichai.phromma@kmutt.ac.th',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
    hasPassword: true,
    ownedUnfinishedTicketCount: 0,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-01T02:00:00.000Z',
    ...overrides,
  }
}

// The signed-in Administrator as the list returns them.
const SELF = adminUser({ id: ADMINISTRATOR.id, name: ADMINISTRATOR.name, email: ADMINISTRATOR.email, role: 'ADMINISTRATOR' })
const WICHAI = adminUser()
const SOMCHAI = adminUser({
  id: 7,
  name: 'Somchai Jaidee',
  email: 'somchai.jaidee@kmutt.ac.th',
  role: 'REQUESTER',
  isActive: false,
  hasPassword: false,
  mustChangePassword: true,
})

const USERS = [SELF, SOMCHAI, WICHAI]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function listReturns(users: AdminUser[] = USERS) {
  return vi.spyOn(api, 'fetchAdminUsers').mockResolvedValue(users)
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <UserManagement user={ADMINISTRATOR} />
    </MemoryRouter>,
  )
}

// The desktop and tablet table. The mobile cards hold the same users and
// are shown instead of it below 768px, by CSS.
async function table() {
  return within(await screen.findByRole('table'))
}

// The Success notice (ui-spec.md §2.3). The loading skeleton is a status
// too, so the notice is found by its own class.
function successNotice() {
  return document.querySelector('.tk-alert--success[role="status"]')
}

function rowOf(scope: ReturnType<typeof within>, name: string) {
  return within(scope.getByRole('row', { name: new RegExp(name) }))
}

describe('User Management list', () => {
  // UI-26 (AC-40)
  it('lists each user with Name, Email, Role, Status, and an Edit action', async () => {
    const fetchAdminUsers = listReturns()

    renderScreen()

    const users = await table()
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument()
    expect(users.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
      'Email',
      'Role',
      'Status',
      'Actions',
    ])
    expect(fetchAdminUsers).toHaveBeenCalledWith({})

    const wichai = rowOf(users, 'Wichai Phromma')
    expect(wichai.getByText('wichai.phromma@kmutt.ac.th')).toBeInTheDocument()
    expect(wichai.getByText('IT Staff')).toHaveClass('tk-badge--info')
    expect(wichai.getByText('Active')).toHaveClass('tk-badge--success')
    expect(wichai.getByRole('button', { name: 'Edit Wichai Phromma' })).toBeInTheDocument()
    expect(wichai.queryByText('No password set')).not.toBeInTheDocument()
    expect(wichai.queryByText('(you)')).not.toBeInTheDocument()

    // An inactive user with no password yet.
    const somchai = rowOf(users, 'Somchai Jaidee')
    expect(somchai.getByText('Requester')).toHaveClass('tk-badge--neutral')
    expect(somchai.getByText('Inactive')).toHaveClass('tk-badge--neutral')
    expect(somchai.getByText('No password set')).toBeInTheDocument()

    // The signed-in Administrator's own row.
    const self = rowOf(users, 'Apinya Thongchai')
    expect(self.getByText('(you)')).toBeInTheDocument()
    expect(self.getByText('Administrator')).toHaveClass('tk-badge--outline')
  })

  // ui-spec.md §10.3: one card per user on mobile, with the same content
  it('also renders one card per user, for mobile', async () => {
    listReturns()

    renderScreen()

    await table()
    const cards = within(screen.getByRole('list', { name: 'Users' })).getAllByRole('listitem')
    expect(cards).toHaveLength(3)
    const somchai = within(cards[1])
    expect(somchai.getByText('Somchai Jaidee')).toBeInTheDocument()
    expect(somchai.getByText('Inactive')).toBeInTheDocument()
    expect(somchai.getByText('somchai.jaidee@kmutt.ac.th')).toBeInTheDocument()
    expect(somchai.getByText('Requester')).toBeInTheDocument()
    expect(somchai.getByRole('button', { name: 'Edit Somchai Jaidee' })).toBeInTheDocument()
  })

  it('shows skeleton rows while the users load', async () => {
    let answer: (users: AdminUser[]) => void = () => {}
    vi.spyOn(api, 'fetchAdminUsers').mockReturnValue(new Promise((resolve) => (answer = resolve)))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading users…')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    answer(USERS)
    await table()
    expect(screen.queryByText('Loading users…')).not.toBeInTheDocument()
  })

  // UI-26 (AC-40): search, applied 300ms after typing stops
  it('searches by name or email once typing stops, trimmed', async () => {
    const fetchAdminUsers = listReturns()
    renderScreen()
    await table()
    fetchAdminUsers.mockClear()
    fetchAdminUsers.mockResolvedValue([WICHAI])

    const search = screen.getByRole('searchbox', { name: 'Search users' })
    expect(search).toHaveAttribute('placeholder', 'Search by name or email…')
    fireEvent.change(search, { target: { value: 'wi' } })
    fireEvent.change(search, { target: { value: ' wichai ' } })
    // Nothing is requested while the user is still typing.
    expect(fetchAdminUsers).not.toHaveBeenCalled()

    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledWith({ search: 'wichai' }))
    expect(fetchAdminUsers).toHaveBeenCalledTimes(1)
    const users = await table()
    await waitFor(() => expect(users.getAllByRole('row')).toHaveLength(2))
    expect(users.getByText('Wichai Phromma')).toBeInTheDocument()
  })

  // UI-26 (AC-40): role filter, combined with the search
  it('filters by one role, together with the search', async () => {
    const fetchAdminUsers = listReturns()
    renderScreen()
    await table()

    const role = screen.getByRole('combobox', { name: 'Role' })
    expect(within(role).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All roles',
      'Requester',
      'IT Staff',
      'Administrator',
    ])
    fireEvent.change(role, { target: { value: 'IT_STAFF' } })

    await waitFor(() => expect(fetchAdminUsers).toHaveBeenLastCalledWith({ role: 'IT_STAFF' }))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'wichai' } })

    await waitFor(() => expect(fetchAdminUsers).toHaveBeenLastCalledWith({ search: 'wichai', role: 'IT_STAFF' }))
  })

  // UI-26 (AC-40): no results, with Clear Filters
  it('says so when no user matches, and Clear Filters brings every user back', async () => {
    const fetchAdminUsers = listReturns()
    renderScreen()
    await table()
    fetchAdminUsers.mockResolvedValue([])

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'ADMINISTRATOR' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'nobody' } })

    await waitFor(() => expect(fetchAdminUsers).toHaveBeenLastCalledWith({ search: 'nobody', role: 'ADMINISTRATOR' }))
    const noResults = (await screen.findByText('No users match your search or filter.')).parentElement!
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fetchAdminUsers.mockResolvedValue(USERS)

    fireEvent.click(within(noResults).getByRole('button', { name: 'Clear Filters' }))

    await waitFor(() => expect(fetchAdminUsers).toHaveBeenLastCalledWith({}))
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('')
    expect((await table()).getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByText('No users match your search or filter.')).not.toBeInTheDocument()
  })

  // ui-spec.md §10.1: safe failure with Retry
  it('shows the safe failure with Retry when the users cannot be loaded, and loads them on Retry', async () => {
    const fetchAdminUsers = vi
      .spyOn(api, 'fetchAdminUsers')
      .mockRejectedValueOnce(new api.ApiError(500, 'relation "User" does not exist', 'INTERNAL_ERROR'))
    renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.queryByText(/relation|500/)).not.toBeInTheDocument()
    // The controls keep their place.
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toBeInTheDocument()
    fetchAdminUsers.mockResolvedValue(USERS)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect((await table()).getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ui-spec.md §2.3: a 403 FORBIDDEN shows the Forbidden page
  it('shows the Forbidden page when the API answers 403 FORBIDDEN', async () => {
    vi.spyOn(api, 'fetchAdminUsers').mockRejectedValue(
      new api.ApiError(403, 'You do not have permission to do this.', 'FORBIDDEN'),
    )

    renderScreen()

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create User' })).not.toBeInTheDocument()
  })
})

const INITIAL_PASSWORD = 'K7mQ-R2xV-9bTz-HdN4'

async function openCreatePanel() {
  renderScreen()
  await table()
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }))

  return within(screen.getByRole('region', { name: 'Create New User' }))
}

function fill(panel: ReturnType<typeof within>, values: { name?: string; email?: string; role?: string }) {
  if (values.name !== undefined) fireEvent.change(panel.getByLabelText(/Full Name/), { target: { value: values.name } })
  if (values.email !== undefined) {
    fireEvent.change(panel.getByLabelText(/Email Address/), { target: { value: values.email } })
  }
  if (values.role !== undefined) fireEvent.change(panel.getByLabelText(/Role/), { target: { value: values.role } })
}

const ALEX = adminUser({
  id: 31,
  name: 'Alex Thompson',
  email: 'alex.thompson@kmutt.ac.th',
  role: 'IT_STAFF',
  mustChangePassword: true,
})

describe('User Management create', () => {
  // UI-27 (AC-41): no password field
  it('opens a Create New User panel with no password field and no email option', async () => {
    listReturns()

    const panel = await openCreatePanel()

    expect(panel.getByRole('heading', { name: 'Create New User' })).toBeInTheDocument()
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('')
    expect(panel.getByLabelText(/Full Name/)).toBeRequired()
    expect(panel.getByLabelText(/Email Address/)).toHaveValue('')
    expect(panel.getByLabelText(/Email Address/)).toBeRequired()
    const role = panel.getByLabelText(/Role/)
    expect(role).toBeRequired()
    expect(role).toHaveValue('')
    expect(within(role).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Select a role…',
      'Requester',
      'IT Staff',
      'Administrator',
    ])
    const active = panel.getByRole('switch', { name: /Active/ })
    expect(active).toBeChecked()
    expect(panel.getByText('Yes')).toBeInTheDocument()

    expect(panel.getByText('Initial Password')).toBeInTheDocument()
    expect(
      panel.getByText(
        'A temporary password is generated when you save and shown once. The user must change it at first login.',
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(panel.getAllByRole('textbox')).toHaveLength(2)
    expect(panel.queryByText(/send/i)).not.toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Save User' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(panel.queryByRole('button', { name: 'Set New Initial Password' })).not.toBeInTheDocument()
  })

  // UI-27 (AC-41): one-time password dialog; Done discards it
  it('creates the user, shows the temporary password once, and discards it on Done', async () => {
    const fetchAdminUsers = listReturns()
    let answer: (result: { user: AdminUser; initialPassword: string }) => void = () => {}
    const createAdminUser = vi
      .spyOn(api, 'createAdminUser')
      .mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const panel = await openCreatePanel()

    fill(panel, { name: '  Alex Thompson ', email: ' alex.thompson@kmutt.ac.th ', role: 'IT_STAFF' })
    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    expect(createAdminUser).toHaveBeenCalledTimes(1)
    expect(createAdminUser).toHaveBeenCalledWith({
      name: 'Alex Thompson',
      email: 'alex.thompson@kmutt.ac.th',
      role: 'IT_STAFF',
      isActive: true,
    })
    // Submitting: Save is busy and disabled.
    const save = panel.getByRole('button', { name: 'Save User' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(save)
    expect(createAdminUser).toHaveBeenCalledTimes(1)

    answer({ user: ALEX, initialPassword: INITIAL_PASSWORD })

    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for Alex Thompson' })
    const password = within(dialog).getByRole('textbox', { name: 'Temporary password' })
    expect(password).toHaveValue(INITIAL_PASSWORD)
    expect(password).toHaveAttribute('readonly')
    expect(
      within(dialog).getByText(
        'This password is shown only once. Give it to the user securely. They must change it when they sign in.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Copy', 'Done'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(INITIAL_PASSWORD)
    expect(await within(dialog).findByText('Copied')).toBeInTheDocument()

    // Escape and the backdrop do not close it.
    fireEvent.keyDown(password, { key: 'Escape' })
    fireEvent.click(dialog.parentElement!)
    expect(screen.getByRole('dialog', { name: 'Temporary password for Alex Thompson' })).toBeInTheDocument()
    fetchAdminUsers.mockClear()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Create New User' })).not.toBeInTheDocument()
    expect(successNotice()).toHaveTextContent('User created.')
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(1))
    await table()
    // The password is gone from the page and cannot be shown again.
    expect(document.body.innerHTML).not.toContain(INITIAL_PASSWORD)
    expect(screen.queryByDisplayValue(INITIAL_PASSWORD)).not.toBeInTheDocument()
  })

  it('creates an inactive user when the Active switch is turned off', async () => {
    listReturns()
    const createAdminUser = vi
      .spyOn(api, 'createAdminUser')
      .mockResolvedValue({ user: { ...ALEX, isActive: false }, initialPassword: INITIAL_PASSWORD })
    const panel = await openCreatePanel()

    fill(panel, { name: 'Alex Thompson', email: 'alex.thompson@kmutt.ac.th', role: 'REQUESTER' })
    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    expect(panel.getByText('No')).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    await screen.findByRole('dialog', { name: 'Temporary password for Alex Thompson' })
    expect(createAdminUser).toHaveBeenCalledWith({
      name: 'Alex Thompson',
      email: 'alex.thompson@kmutt.ac.th',
      role: 'REQUESTER',
      isActive: false,
    })
  })

  it('closes on Cancel without creating anyone', async () => {
    listReturns()
    const createAdminUser = vi.spyOn(api, 'createAdminUser')
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson' })

    fireEvent.click(panel.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: 'Create New User' })).not.toBeInTheDocument()
    expect(createAdminUser).not.toHaveBeenCalled()
    expect(successNotice()).toBeNull()
  })
})

function describedBy(field: HTMLElement) {
  return document.getElementById(field.getAttribute('aria-describedby') ?? '')
}

describe('User Management validation', () => {
  // UI-28 (AC-42): invalid fields -> field messages, no request
  it('shows a message under each missing field, focuses the first, and sends nothing', async () => {
    listReturns()
    const createAdminUser = vi.spyOn(api, 'createAdminUser')
    const panel = await openCreatePanel()

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    const name = panel.getByLabelText(/Full Name/)
    const email = panel.getByLabelText(/Email Address/)
    const role = panel.getByLabelText(/Role/)
    expect(describedBy(name)).toHaveTextContent('Full name is required.')
    expect(describedBy(email)).toHaveTextContent('Email address is required.')
    expect(describedBy(role)).toHaveTextContent('Select a role.')
    for (const field of [name, email, role]) expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(createAdminUser).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'a name of one character', values: { name: ' A ' }, field: /Full Name/, message: 'Full name must be 2 to 100 characters.' },
    {
      name: 'a name of 101 characters',
      values: { name: 'N'.repeat(101) },
      field: /Full Name/,
      message: 'Full name must be 2 to 100 characters.',
    },
    { name: 'an email with no @', values: { email: 'alex.example.com' }, field: /Email Address/, message: 'Enter a valid email address.' },
    { name: 'an email with no domain', values: { email: 'alex@kmutt' }, field: /Email Address/, message: 'Enter a valid email address.' },
    {
      name: 'an email of 255 characters',
      values: { email: `${'a'.repeat(243)}@kmutt.ac.th` },
      field: /Email Address/,
      message: 'Email must be at most 254 characters.',
    },
  ])('refuses $name under its field, and clears the message once it is edited', async ({ values, field, message }) => {
    listReturns()
    const createAdminUser = vi.spyOn(api, 'createAdminUser')
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'alex.thompson@kmutt.ac.th', role: 'IT_STAFF', ...values })

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    const input = panel.getByLabelText(field)
    expect(describedBy(input)).toHaveTextContent(message)
    expect(input).toHaveFocus()
    // It is the only message shown.
    expect(document.querySelectorAll('.invalid-feedback')).toHaveLength(1)
    expect(createAdminUser).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'something else' } })

    expect(panel.queryByText(message)).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  // UI-28 (AC-42): duplicate email -> message under Email
  it('shows the duplicate-email message under Email and keeps what was typed', async () => {
    listReturns()
    vi.spyOn(api, 'createAdminUser').mockRejectedValue(
      new api.ApiError(409, 'A user with this email already exists.', 'EMAIL_TAKEN', 'email'),
    )
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'wichai.phromma@kmutt.ac.th', role: 'IT_STAFF' })

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    const email = panel.getByLabelText(/Email Address/)
    await waitFor(() => expect(describedBy(email)).toHaveTextContent('A user with this email already exists.'))
    expect(email).toHaveFocus()
    expect(email).toHaveValue('wichai.phromma@kmutt.ac.th')
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Alex Thompson')
    expect(panel.getByLabelText(/Role/)).toHaveValue('IT_STAFF')
    expect(panel.getByRole('button', { name: 'Save User' })).toBeEnabled()
    expect(panel.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ui-spec.md §10.2: a 400 from the API is shown under the field it names
  it("shows the API's own message under the field a 400 names", async () => {
    listReturns()
    vi.spyOn(api, 'createAdminUser').mockRejectedValue(
      new api.ApiError(400, 'Enter a valid email address.', 'VALIDATION_ERROR', 'email'),
    )
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'alex@kmutt.c', role: 'IT_STAFF' })

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    const email = panel.getByLabelText(/Email Address/)
    await waitFor(() => expect(describedBy(email)).toHaveTextContent('Enter a valid email address.'))
    expect(panel.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ui-spec.md §10.2: Failure -> safe failure alert in the panel; fields
  // keep their values
  it.each([
    { name: 'a 500', error: new api.ApiError(500, 'duplicate key value violates unique constraint', 'INTERNAL_ERROR') },
    { name: 'a lost connection', error: new Error('Unable to connect to TokTickIT API') },
    {
      name: 'a 409 the screen does not name',
      error: new api.ApiError(409, 'Use Change Password for your own account.', 'SELF_INITIAL_PASSWORD'),
    },
  ])('shows the safe failure in the panel after $name and keeps the fields', async ({ error }) => {
    listReturns()
    vi.spyOn(api, 'createAdminUser').mockRejectedValue(error)
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'alex.thompson@kmutt.ac.th', role: 'IT_STAFF' })

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    expect(await panel.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(panel.queryByText(/duplicate key|Unable to connect|Use Change Password/)).not.toBeInTheDocument()
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Alex Thompson')
    expect(panel.getByLabelText(/Email Address/)).toHaveValue('alex.thompson@kmutt.ac.th')
    expect(panel.getByLabelText(/Role/)).toHaveValue('IT_STAFF')
    expect(panel.getByRole('button', { name: 'Save User' })).toBeEnabled()
  })
})

async function openEditPanel(name: string) {
  renderScreen()
  fireEvent.click((await table()).getByRole('button', { name: `Edit ${name}` }))

  return within(screen.getByRole('region', { name: 'Edit User' }))
}

function saved(user: AdminUser, unassignedTicketCount = 0) {
  return vi.spyOn(api, 'updateAdminUser').mockResolvedValue({ user, unassignedTicketCount })
}

describe('User Management edit', () => {
  // UI-29 (AC-43)
  it('opens an Edit User panel with the fields prefilled', async () => {
    listReturns()

    const panel = await openEditPanel('Somchai Jaidee')

    expect(panel.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument()
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Somchai Jaidee')
    expect(panel.getByLabelText(/Email Address/)).toHaveValue('somchai.jaidee@kmutt.ac.th')
    expect(panel.getByLabelText(/Role/)).toHaveValue('REQUESTER')
    expect(panel.getByRole('switch', { name: /Active/ })).not.toBeChecked()
    expect(panel.getByText('No')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Set New Initial Password' })).toBeInTheDocument()
    // The create-mode explanation is not shown, and there is still no
    // password field.
    expect(panel.queryByText(/A temporary password is generated when you save/)).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeNull()
  })

  it('shows the user whose Edit was pressed last', async () => {
    listReturns()
    const panel = await openEditPanel('Somchai Jaidee')
    fireEvent.change(panel.getByLabelText(/Full Name/), { target: { value: 'Half Typed' } })

    fireEvent.click((await table()).getByRole('button', { name: 'Edit Wichai Phromma' }))

    const next = within(screen.getByRole('region', { name: 'Edit User' }))
    expect(next.getByLabelText(/Full Name/)).toHaveValue('Wichai Phromma')
    expect(next.getByLabelText(/Role/)).toHaveValue('IT_STAFF')
    expect(next.getByRole('switch', { name: /Active/ })).toBeChecked()
  })

  it('keeps what was typed when Edit is pressed again on the same unchanged row', async () => {
    listReturns()
    const panel = await openEditPanel('Wichai Phromma')
    fill(panel, { name: 'Half Typed' })

    fireEvent.click((await table()).getByRole('button', { name: 'Edit Wichai Phromma' }))

    expect(within(screen.getByRole('region', { name: 'Edit User' })).getByLabelText(/Full Name/)).toHaveValue('Half Typed')
  })

  // The form starts from the row whose Edit was pressed, so a change made
  // elsewhere is not taken for an edit made here.
  it('starts again from the row when Edit is pressed on a user the reloaded list shows changed', async () => {
    const fetchAdminUsers = listReturns()
    const updateAdminUser = saved({ ...WICHAI, name: 'Wichai Renamed', role: 'REQUESTER', isActive: false })
    const stale = await openEditPanel('Wichai Phromma')
    fill(stale, { name: 'Half Typed' })
    fetchAdminUsers.mockResolvedValue([SELF, { ...WICHAI, role: 'REQUESTER', isActive: false }])
    fireEvent.change(screen.getByLabelText('Role', { selector: '#users-role' }), { target: { value: 'REQUESTER' } })
    expect(await rowOf(await table(), 'Wichai Phromma').findByText('Inactive')).toBeInTheDocument()

    fireEvent.click((await table()).getByRole('button', { name: 'Edit Wichai Phromma' }))

    const panel = within(screen.getByRole('region', { name: 'Edit User' }))
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Wichai Phromma')
    expect(panel.getByLabelText(/Role/)).toHaveValue('REQUESTER')
    expect(panel.getByRole('switch', { name: /Active/ })).not.toBeChecked()

    fill(panel, { name: 'Wichai Renamed' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).toHaveBeenCalledTimes(1)
    expect(updateAdminUser).toHaveBeenCalledWith(12, { name: 'Wichai Renamed' })
  })

  // UI-29 (AC-43): saved
  it('saves a changed name and email without a confirmation, closes, and reloads the list', async () => {
    const fetchAdminUsers = listReturns()
    let answer: (result: { user: AdminUser; unassignedTicketCount: number }) => void = () => {}
    const updateAdminUser = vi
      .spyOn(api, 'updateAdminUser')
      .mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const panel = await openEditPanel('Wichai Phromma')
    fetchAdminUsers.mockClear()

    fill(panel, { name: ' Wichai P. Phromma ', email: 'wichai.p@kmutt.ac.th' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).toHaveBeenCalledTimes(1)
    expect(updateAdminUser).toHaveBeenCalledWith(12, { name: 'Wichai P. Phromma', email: 'wichai.p@kmutt.ac.th' })
    const save = panel.getByRole('button', { name: 'Save Changes' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('aria-busy', 'true')

    answer({ user: { ...WICHAI, name: 'Wichai P. Phromma', email: 'wichai.p@kmutt.ac.th' }, unassignedTicketCount: 0 })

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Edit User' })).not.toBeInTheDocument())
    expect(successNotice()).toHaveTextContent(/^Changes saved\.$/)
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends only the field that was changed', async () => {
    listReturns()
    const updateAdminUser = saved({ ...WICHAI, email: 'wichai.p@kmutt.ac.th' })
    const panel = await openEditPanel('Wichai Phromma')

    fill(panel, { email: 'wichai.p@kmutt.ac.th' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(updateAdminUser).toHaveBeenCalledTimes(1)
    expect(updateAdminUser).toHaveBeenCalledWith(12, { email: 'wichai.p@kmutt.ac.th' })
    await waitFor(() => expect(successNotice()).toHaveTextContent(/^Changes saved\.$/))
  })

  it('sends nothing when no field was changed, closes, reloads the list, and says Changes saved', async () => {
    const fetchAdminUsers = listReturns()
    const updateAdminUser = vi.spyOn(api, 'updateAdminUser')
    const onSelfSaved = vi.fn()
    render(
      <MemoryRouter>
        <UserManagement user={ADMINISTRATOR} onSelfSaved={onSelfSaved} />
      </MemoryRouter>,
    )
    fireEvent.click((await table()).getByRole('button', { name: 'Edit Apinya Thongchai' }))
    const panel = within(screen.getByRole('region', { name: 'Edit User' }))
    fetchAdminUsers.mockClear()

    // Typed and put back, with spaces around it: still the same name.
    fill(panel, { name: 'Someone Else' })
    fill(panel, { name: ` ${SELF.name} ` })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(screen.queryByRole('region', { name: 'Edit User' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).not.toHaveBeenCalled()
    expect(onSelfSaved).not.toHaveBeenCalled()
    expect(successNotice()).toHaveTextContent(/^Changes saved\.$/)
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(1))
  })

  // The panel holds the row as it was when Edit was pressed: a change made
  // elsewhere since is not put back by saving another field.
  it('leaves a user inactive who was deactivated elsewhere while a rename was being typed', async () => {
    const fetchAdminUsers = listReturns()
    const deactivatedElsewhere = { ...WICHAI, name: 'Wichai Renamed', isActive: false }
    const updateAdminUser = saved(deactivatedElsewhere)
    const panel = await openEditPanel('Wichai Phromma')
    expect(panel.getByRole('switch', { name: /Active/ })).toBeChecked()
    fetchAdminUsers.mockResolvedValue([SELF, deactivatedElsewhere])

    fill(panel, { name: 'Wichai Renamed' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).toHaveBeenCalledTimes(1)
    expect(updateAdminUser).toHaveBeenCalledWith(12, { name: 'Wichai Renamed' })
    await waitFor(() => expect(successNotice()).toHaveTextContent(/^Changes saved\.$/))
    const row = rowOf(await table(), 'Wichai Renamed')
    expect(await row.findByText('Inactive')).toBeInTheDocument()
  })

  // UI-29 (AC-47): deactivate an owner of three Tickets
  it('confirms that three tickets return to the queue before deactivating their owner', async () => {
    const owner = { ...WICHAI, ownedUnfinishedTicketCount: 3 }
    listReturns([SELF, owner])
    const updateAdminUser = saved({ ...owner, isActive: false, ownedUnfinishedTicketCount: 0 }, 3)
    const panel = await openEditPanel('Wichai Phromma')

    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(
        'Wichai Phromma will be signed out. 3 unfinished tickets they own will return to the queue as unassigned.',
      ),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Deactivate' })).toHaveClass('btn-outline-danger')
    expect(updateAdminUser).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Deactivate' }))

    expect(updateAdminUser).toHaveBeenCalledWith(12, { isActive: false })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Edit User' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(successNotice()).toHaveTextContent('Changes saved. 3 tickets returned to the queue as unassigned.')
  })

  // ui-spec.md §2.3: Cancel, Escape, or the backdrop sends no request
  it.each([
    { name: 'Cancel', dismiss: (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })) },
    { name: 'Escape', dismiss: (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape' }) },
    { name: 'the backdrop', dismiss: (dialog: HTMLElement) => fireEvent.click(dialog.parentElement!) },
  ])('sends nothing when the confirmation is dismissed by $name, and keeps the panel as it was', async ({ dismiss }) => {
    listReturns([SELF, { ...WICHAI, ownedUnfinishedTicketCount: 3 }])
    const updateAdminUser = vi.spyOn(api, 'updateAdminUser')
    const panel = await openEditPanel('Wichai Phromma')
    fill(panel, { name: 'Wichai Renamed' })
    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    dismiss(screen.getByRole('dialog'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).not.toHaveBeenCalled()
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Wichai Renamed')
    expect(panel.getByRole('switch', { name: /Active/ })).not.toBeChecked()
    expect(panel.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  })

  it.each([
    { owned: 0, message: /^Wichai Phromma will be signed out\.$/, notice: /^Changes saved\.$/ },
    {
      owned: 1,
      message: 'Wichai Phromma will be signed out. 1 unfinished ticket they own will return to the queue as unassigned.',
      notice: 'Changes saved. 1 ticket returned to the queue as unassigned.',
    },
  ])('words the deactivation of an owner of $owned tickets accordingly', async ({ owned, message, notice }) => {
    const owner = { ...WICHAI, ownedUnfinishedTicketCount: owned }
    listReturns([SELF, owner])
    saved({ ...owner, isActive: false, ownedUnfinishedTicketCount: 0 }, owned)
    const panel = await openEditPanel('Wichai Phromma')

    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText(message)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(successNotice()).toHaveTextContent(notice))
  })

  // ui-spec.md §10.2: IT Staff or Administrator changed to Requester
  it('confirms that tickets return to the queue before making a staff user a Requester', async () => {
    const owner = { ...WICHAI, ownedUnfinishedTicketCount: 2 }
    listReturns([SELF, owner])
    const updateAdminUser = saved({ ...owner, role: 'REQUESTER', ownedUnfinishedTicketCount: 0 }, 2)
    const panel = await openEditPanel('Wichai Phromma')

    fill(panel, { role: 'REQUESTER' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(
        'Wichai Phromma will be signed out. 2 unfinished tickets they own will return to the queue as unassigned.',
      ),
    ).toBeInTheDocument()
    // Destructive is for a deactivation only.
    expect(dialog.getByRole('button', { name: 'Change Role' })).toHaveClass('btn-primary')
    expect(updateAdminUser).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Change Role' }))

    expect(updateAdminUser).toHaveBeenCalledWith(12, { role: 'REQUESTER' })
    await waitFor(() =>
      expect(successNotice()).toHaveTextContent('Changes saved. 2 tickets returned to the queue as unassigned.'),
    )
  })

  // ui-spec.md §10.2: any other role change
  it.each([
    { user: 'Wichai Phromma', to: 'ADMINISTRATOR', label: 'Administrator' },
    { user: 'Somchai Jaidee', to: 'IT_STAFF', label: 'IT Staff' },
  ])('confirms the sign-out and the new navigation before making $user $label', async ({ user, to, label }) => {
    listReturns()
    const updateAdminUser = saved({ ...WICHAI, role: to as AdminUser['role'] })
    const panel = await openEditPanel(user)

    fill(panel, { role: to })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(`${user} will be signed out and will see the ${label} navigation at next sign-in.`),
    ).toBeInTheDocument()
    expect(updateAdminUser).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Change Role' }))

    expect(updateAdminUser).toHaveBeenCalledWith(expect.any(Number), { role: to })
    await waitFor(() => expect(successNotice()).toHaveTextContent(/^Changes saved\.$/))
  })

  it('validates before it asks for a confirmation', async () => {
    listReturns()
    const updateAdminUser = vi.spyOn(api, 'updateAdminUser')
    const panel = await openEditPanel('Wichai Phromma')

    fill(panel, { name: '' })
    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(describedBy(panel.getByLabelText(/Full Name/))).toHaveTextContent('Full name is required.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateAdminUser).not.toHaveBeenCalled()
  })
})

describe('User Management new initial password', () => {
  const CONFIRMATION = "Wichai Phromma's current password will stop working and they will be signed out."

  // UI-30 (AC-44): confirmation, then the one-time password dialog
  it('confirms, then shows the new temporary password once', async () => {
    const fetchAdminUsers = listReturns()
    const setInitialPassword = vi.spyOn(api, 'setInitialPassword').mockResolvedValue({ initialPassword: INITIAL_PASSWORD })
    const updateAdminUser = vi.spyOn(api, 'updateAdminUser')
    const panel = await openEditPanel('Wichai Phromma')
    fill(panel, { name: 'Wichai Half Typed' })

    fireEvent.click(panel.getByRole('button', { name: 'Set New Initial Password' }))

    const confirmation = within(screen.getByRole('dialog'))
    expect(confirmation.getByText(CONFIRMATION)).toBeInTheDocument()
    expect(setInitialPassword).not.toHaveBeenCalled()
    fetchAdminUsers.mockClear()

    fireEvent.click(confirmation.getByRole('button', { name: 'Set New Initial Password' }))

    expect(setInitialPassword).toHaveBeenCalledTimes(1)
    expect(setInitialPassword).toHaveBeenCalledWith(12)
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for Wichai Phromma' })
    expect(within(dialog).getByRole('textbox', { name: 'Temporary password' })).toHaveValue(INITIAL_PASSWORD)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(INITIAL_PASSWORD)
    // It is not a save: the panel stays, with what was typed in it.
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Wichai Half Typed')
    expect(updateAdminUser).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(1))
  })

  it.each([
    { name: 'Cancel', dismiss: (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })) },
    { name: 'Escape', dismiss: (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape' }) },
    { name: 'the backdrop', dismiss: (dialog: HTMLElement) => fireEvent.click(dialog.parentElement!) },
  ])('sets nothing when the confirmation is dismissed by $name', async ({ dismiss }) => {
    listReturns()
    const setInitialPassword = vi.spyOn(api, 'setInitialPassword')
    const panel = await openEditPanel('Wichai Phromma')
    fireEvent.click(panel.getByRole('button', { name: 'Set New Initial Password' }))

    dismiss(screen.getByRole('dialog'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(setInitialPassword).not.toHaveBeenCalled()
    expect(panel.getByRole('button', { name: 'Set New Initial Password' })).toBeEnabled()
  })

  it('is busy while the request is in flight, and shows the safe failure in the panel if it fails', async () => {
    listReturns()
    let fail: (error: Error) => void = () => {}
    vi.spyOn(api, 'setInitialPassword').mockReturnValue(new Promise((_resolve, reject) => (fail = reject)))
    const panel = await openEditPanel('Wichai Phromma')
    fireEvent.click(panel.getByRole('button', { name: 'Set New Initial Password' }))

    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Set New Initial Password' })
    fireEvent.click(confirm)

    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')

    fail(new api.ApiError(500, 'bcrypt: out of memory', 'INTERNAL_ERROR'))

    expect(await panel.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/bcrypt/)).not.toBeInTheDocument()
  })
})

describe('User Management refusals', () => {
  // UI-31 (AC-45): own account
  it("disables the Active switch on the Administrator's own account and offers no new initial password", async () => {
    listReturns()

    const panel = await openEditPanel('Apinya Thongchai')

    const active = panel.getByRole('switch', { name: /Active/ })
    expect(active).toBeChecked()
    expect(active).toBeDisabled()
    expect(describedBy(active)).toHaveTextContent('You cannot deactivate your own account.')
    expect(panel.queryByRole('button', { name: 'Set New Initial Password' })).not.toBeInTheDocument()
    expect(panel.getByText('Use Change Password in the menu for your own account.')).toBeInTheDocument()
    // The other fields stay editable.
    expect(panel.getByLabelText(/Full Name/)).toBeEnabled()
    expect(panel.getByLabelText(/Role/)).toBeEnabled()
  })

  it('leaves the Active switch and the password action usable on any other account', async () => {
    listReturns()

    const panel = await openEditPanel('Wichai Phromma')

    expect(panel.getByRole('switch', { name: /Active/ })).toBeEnabled()
    expect(panel.queryByText('You cannot deactivate your own account.')).not.toBeInTheDocument()
    expect(panel.queryByText('Use Change Password in the menu for your own account.')).not.toBeInTheDocument()
  })

  // UI-31 (AC-45, AC-46): the matching alert
  it.each([
    { code: 'SELF_DEACTIVATION', alert: 'You cannot deactivate your own account.' },
    {
      code: 'LAST_ADMINISTRATOR',
      alert: 'This is the last active administrator. Make another user an administrator first.',
    },
  ])('shows the $code alert in the panel and keeps the fields', async ({ code, alert }) => {
    listReturns()
    vi.spyOn(api, 'updateAdminUser').mockRejectedValue(new api.ApiError(409, 'refused by the server', code))
    const panel = await openEditPanel('Apinya Thongchai')
    fill(panel, { name: 'Apinya T.', role: 'IT_STAFF' })

    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change Role' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(alert)
    expect(panel.getByLabelText(/Full Name/)).toHaveValue('Apinya T.')
    expect(panel.getByLabelText(/Role/)).toHaveValue('IT_STAFF')
    expect(panel.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
    expect(successNotice()).toBeNull()
  })

  // UI-31: 404 on save -> the panel closes and the list reloads
  it.each([
    {
      name: 'Save Changes',
      mock: () => vi.spyOn(api, 'updateAdminUser').mockRejectedValue(new api.ApiError(404, 'User not found', 'NOT_FOUND')),
      act: (panel: ReturnType<typeof within>) => {
        fill(panel, { name: 'Wichai Renamed' })
        fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))
      },
    },
    {
      name: 'Set New Initial Password',
      mock: () =>
        vi.spyOn(api, 'setInitialPassword').mockRejectedValue(new api.ApiError(404, 'User not found', 'NOT_FOUND')),
      act: (panel: ReturnType<typeof within>) => {
        fireEvent.click(panel.getByRole('button', { name: 'Set New Initial Password' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set New Initial Password' }))
      },
    },
  ])('closes the panel, says so above the list, and reloads it when $name answers 404', async ({ mock, act }) => {
    const fetchAdminUsers = listReturns()
    mock()
    const panel = await openEditPanel('Wichai Phromma')
    fetchAdminUsers.mockClear()
    fetchAdminUsers.mockResolvedValue([SELF, SOMCHAI])

    act(panel)

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Edit User' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This user could not be found. The list has been reloaded.')
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledTimes(1))
    expect((await table()).queryByText('Wichai Phromma')).not.toBeInTheDocument()
    expect(successNotice()).toBeNull()
  })

  // The shell shows the signed-in Administrator's name, so a change to it
  // is handed up.
  it("reports a saved change to the Administrator's own account", async () => {
    listReturns()
    const renamed = { ...SELF, name: 'Apinya T. Thongchai' }
    saved(renamed)
    const onSelfSaved = vi.fn()
    render(
      <MemoryRouter>
        <UserManagement user={ADMINISTRATOR} onSelfSaved={onSelfSaved} />
      </MemoryRouter>,
    )
    fireEvent.click((await table()).getByRole('button', { name: 'Edit Apinya Thongchai' }))
    const panel = within(screen.getByRole('region', { name: 'Edit User' }))

    fill(panel, { name: 'Apinya T. Thongchai' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSelfSaved).toHaveBeenCalledWith(renamed))
  })
})

describe('User Management at /admin/users', () => {
  it('is reached from the navigation of an Administrator', async () => {
    const fetchAdminUsers = listReturns()
    signedInAs(ADMINISTRATOR)
    emptyDashboards()
    openPath('/')

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'User Management' }))

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin/users')
    expect((await table()).getByText('Wichai Phromma')).toBeInTheDocument()
    expect(fetchAdminUsers).toHaveBeenCalledWith({})
    expect(screen.getByRole('button', { name: 'User Management' })).toHaveAttribute('aria-current', 'page')
  })

  // ui-spec.md §10.1 Forbidden (AC-14): the screen is never mounted, so it
  // requests nothing
  it.each([IT_STAFF, REQUESTER])('shows $role the Forbidden page and requests no users', async (user) => {
    const fetchAdminUsers = listReturns()
    vi.spyOn(api, 'fetchTickets').mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } })
    signedInAs(user)
    openPath('/admin/users')

    render(<App />)

    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument()
    expect(fetchAdminUsers).not.toHaveBeenCalled()
  })

  // ui-spec.md §4.1: the user menu shows the signed-in user's name
  it("shows the Administrator's new name in the user menu once they have saved it", async () => {
    listReturns()
    saved({ ...SELF, name: 'Apinya T. Thongchai' })
    signedInAs(ADMINISTRATOR)
    openPath('/admin/users')
    render(<App />)
    fireEvent.click((await table()).getByRole('button', { name: 'Edit Apinya Thongchai' }))
    const panel = within(screen.getByRole('region', { name: 'Edit User' }))

    fill(panel, { name: 'Apinya T. Thongchai' })
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByRole('button', { name: /Apinya T\. Thongchai/ })).toHaveAttribute('aria-haspopup', 'menu')
  })
})

// ui-spec.md §12: dialogs are labelled by their title, keep focus inside,
// close on Escape (except the one-time password dialog), and return focus
// to the control that opened them.
describe('User Management dialogs', () => {
  function belowDesktop() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 991.98px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  }

  // ui-spec.md §10.3: on tablet and mobile the panel is a dialog over the list
  it('opens the panel as a dialog below the desktop width, which Escape closes', async () => {
    belowDesktop()
    listReturns()
    const createAdminUser = vi.spyOn(api, 'createAdminUser')
    renderScreen()
    await table()
    const opener = screen.getByRole('button', { name: 'Create User' })
    opener.focus()

    fireEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Create New User' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.queryByRole('region', { name: 'Create New User' })).not.toBeInTheDocument()
    const name = within(dialog).getByLabelText(/Full Name/)
    expect(name).toHaveFocus()

    // Focus stays inside: Tab from the last control goes to the first, and
    // Shift+Tab from the first to the last.
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(name).toHaveFocus()
    fireEvent.keyDown(name, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(cancel, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(createAdminUser).not.toHaveBeenCalled()
  })

  it('closes only the confirmation, not the panel under it, on Escape below the desktop width', async () => {
    belowDesktop()
    listReturns()
    const updateAdminUser = vi.spyOn(api, 'updateAdminUser')
    renderScreen()
    fireEvent.click((await table()).getByRole('button', { name: 'Edit Wichai Phromma' }))
    const panel = screen.getByRole('dialog', { name: 'Edit User' })
    fireEvent.click(within(panel).getByRole('switch', { name: /Active/ }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Save Changes' }))
    const confirmation = screen.getByRole('dialog', { name: 'Deactivate user?' })

    fireEvent.keyDown(within(confirmation).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Deactivate user?' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit User' })).toBeInTheDocument()
    expect(updateAdminUser).not.toHaveBeenCalled()
  })

  it('moves focus into a confirmation and returns it to Save Changes when dismissed', async () => {
    listReturns()
    const panel = await openEditPanel('Wichai Phromma')
    const save = panel.getByRole('button', { name: 'Save Changes' })
    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    save.focus()

    fireEvent.click(save)

    const confirmation = screen.getByRole('dialog', { name: 'Deactivate user?' })
    const cancel = within(confirmation).getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()

    fireEvent.click(cancel)

    expect(save).toHaveFocus()
  })

  it('puts focus on the temporary password when its dialog opens', async () => {
    listReturns()
    vi.spyOn(api, 'createAdminUser').mockResolvedValue({ user: ALEX, initialPassword: INITIAL_PASSWORD })
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'alex.thompson@kmutt.ac.th', role: 'IT_STAFF' })

    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))

    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for Alex Thompson' })
    expect(within(dialog).getByRole('textbox', { name: 'Temporary password' })).toHaveFocus()
  })

  // No clipboard access: nothing claims the password was copied.
  it('does not say Copied when the clipboard refuses, and selects the password instead', async () => {
    listReturns()
    vi.spyOn(api, 'createAdminUser').mockResolvedValue({ user: ALEX, initialPassword: INITIAL_PASSWORD })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const panel = await openCreatePanel()
    fill(panel, { name: 'Alex Thompson', email: 'alex.thompson@kmutt.ac.th', role: 'IT_STAFF' })
    fireEvent.click(panel.getByRole('button', { name: 'Save User' }))
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for Alex Thompson' })
    const password = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Temporary password' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(password.selectionEnd).toBe(INITIAL_PASSWORD.length))
    expect(password.selectionStart).toBe(0)
    expect(within(dialog).queryByText('Copied')).not.toBeInTheDocument()
  })

  // ui-spec.md §2.3: entered data stays in the form. Crossing the desktop
  // breakpoint (a rotated tablet, a resized window) moves the panel between
  // beside the list and over it, and must not empty it.
  it('keeps what was typed, and an open confirmation, when the width crosses the desktop breakpoint', async () => {
    let compact = false
    const listeners = new Set<() => void>()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return compact && query === '(max-width: 991.98px)'
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      })),
    )
    const resizeTo = (nowCompact: boolean) =>
      act(() => {
        compact = nowCompact
        for (const listener of listeners) listener()
      })
    listReturns()
    const updateAdminUser = saved({ ...WICHAI, name: 'Wichai Renamed', isActive: false })
    const panel = await openEditPanel('Wichai Phromma')
    fill(panel, { name: 'Wichai Renamed' })
    fireEvent.click(panel.getByRole('switch', { name: /Active/ }))
    fireEvent.click(panel.getByRole('button', { name: 'Save Changes' }))
    expect(screen.getByRole('dialog', { name: 'Deactivate user?' })).toBeInTheDocument()

    resizeTo(true)

    const asDialog = within(screen.getByRole('dialog', { name: 'Edit User' }))
    expect(asDialog.getByLabelText(/Full Name/)).toHaveValue('Wichai Renamed')
    expect(asDialog.getByRole('switch', { name: /Active/ })).not.toBeChecked()
    expect(screen.getByRole('dialog', { name: 'Deactivate user?' })).toBeInTheDocument()

    resizeTo(false)

    const beside = within(screen.getByRole('region', { name: 'Edit User' }))
    expect(beside.getByLabelText(/Full Name/)).toHaveValue('Wichai Renamed')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Deactivate user?' })).getByRole('button', { name: 'Deactivate' }))
    expect(updateAdminUser).toHaveBeenCalledWith(12, { name: 'Wichai Renamed', isActive: false })
  })
})
