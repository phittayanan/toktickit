import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './api'
import { ADMINISTRATOR, IT_STAFF, openPath, REQUESTER, signedOut } from './test/session'

beforeEach(() => {
  signedOut()
  vi.spyOn(api, 'fetchCategories').mockResolvedValue([{ id: 1, name: 'Hardware' }])
  vi.spyOn(api, 'fetchTickets').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
  vi.spyOn(api, 'fetchAdminUsers').mockResolvedValue([])
  vi.spyOn(api, 'fetchStaffQueue').mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  })
  vi.spyOn(api, 'fetchEligibleOwners').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function openLogin() {
  openPath('/login')
  render(<App />)
  await screen.findByRole('heading', { name: 'Sign in to your account' })
}

function typeCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
}

describe('Login', () => {
  // UI-01 (AC-01): valid submit for each role
  it.each([
    { user: REQUESTER, landing: '/tickets' },
    { user: IT_STAFF, landing: '/staff/queue' },
    { user: ADMINISTRATOR, landing: '/admin/users' },
  ])('signs in $user.role with one login call and opens $landing', async ({ user, landing }) => {
    const login = vi.spyOn(api, 'login').mockResolvedValue(user)
    await openLogin()

    typeCredentials(user.email, 'Correct-Horse-9')
    submit()

    await waitFor(() => expect(window.location.pathname).toBe(landing))
    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith(user.email, 'Correct-Horse-9')
    expect(await screen.findByRole('button', { name: new RegExp(user.name) })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in to your account' })).not.toBeInTheDocument()
  })

  // UI-01 (AC-02): success goes to Change Password when the password must
  // be changed
  it('opens Change Password after signing in a user who must change their password', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({ ...REQUESTER, mustChangePassword: true })
    await openLogin()

    typeCredentials(REQUESTER.email, 'TokTickIT-Lab3!')
    submit()

    expect(await screen.findByRole('heading', { name: 'Change Password' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
    expect(api.fetchTickets).not.toHaveBeenCalled()
  })

  // ui-spec.md §5: Initial state and controls
  it('starts with empty fields, focus on Email, and the helper text', async () => {
    await openLogin()

    const email = screen.getByLabelText('Email address')
    const password = screen.getByLabelText('Password')
    expect(email).toHaveValue('')
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveValue('')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByText('Forgot your password? Contact an administrator.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ui-spec.md §5, §12: the show/hide button's name reflects its state
  it('shows and hides the password with a button named for its state', async () => {
    await openLogin()
    typeCredentials(REQUESTER.email, 'Correct-Horse-9')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Password')).toHaveValue('Correct-Horse-9')
  })

  // UI-02 (AC-05, AC-06, AC-07): 401, 403 inactive, and 429 responses
  it.each([
    {
      refusal: new api.ApiError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS'),
      message: 'Invalid email or password.',
      variant: 'error',
    },
    {
      refusal: new api.ApiError(403, 'This account is inactive. Contact an administrator.', 'ACCOUNT_INACTIVE'),
      message: 'This account is inactive. Contact an administrator.',
      variant: 'error',
    },
    {
      refusal: new api.ApiError(429, 'Too many failed sign-in attempts. Try again later.', 'LOGIN_THROTTLED'),
      message: 'Too many failed sign-in attempts. Try again later.',
      variant: 'warning',
    },
  ])(
    'shows the $variant alert for a $refusal.status, clears the password and keeps the email',
    async ({ refusal, message, variant }) => {
      vi.spyOn(api, 'login').mockRejectedValue(refusal)
      await openLogin()

      typeCredentials('somchai.jaidee@kmutt.ac.th', 'Wrong-Password-1')
      submit()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(message)
      expect(alert).toHaveClass(`tk-alert--${variant}`)
      expect(screen.getByLabelText('Password')).toHaveValue('')
      expect(screen.getByLabelText('Email address')).toHaveValue('somchai.jaidee@kmutt.ac.th')
      expect(window.location.pathname).toBe('/login')
    },
  )

  // ui-spec.md §5: after invalid credentials, focus returns to Password
  it('returns focus to Password after invalid credentials', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(
      new api.ApiError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS'),
    )
    await openLogin()

    typeCredentials('somchai.jaidee@kmutt.ac.th', 'Wrong-Password-1')
    submit()

    await screen.findByRole('alert')
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus())
  })

  // UI-03 (AC-52): empty and malformed fields -> field messages, no call
  it.each([
    { email: '', password: 'Correct-Horse-9', field: 'Email address', message: 'Enter your email address.' },
    { email: '   ', password: 'Correct-Horse-9', field: 'Email address', message: 'Enter your email address.' },
    {
      email: 'somchai.jaidee',
      password: 'Correct-Horse-9',
      field: 'Email address',
      message: 'Enter a valid email address.',
    },
    {
      email: 'somchai@kmutt',
      password: 'Correct-Horse-9',
      field: 'Email address',
      message: 'Enter a valid email address.',
    },
    { email: 'somchai.jaidee@kmutt.ac.th', password: '', field: 'Password', message: 'Enter your password.' },
  ])(
    'shows "$message" under $field for email "$email" and sends no request',
    async ({ email, password, field, message }) => {
      const login = vi.spyOn(api, 'login')
      await openLogin()

      typeCredentials(email, password)
      submit()

      const input = screen.getByLabelText(field)
      expect(input).toBeInvalid()
      expect(input).toHaveAccessibleDescription(message)
      expect(login).not.toHaveBeenCalled()
    },
  )

  it('shows a message under both fields when both are empty', async () => {
    const login = vi.spyOn(api, 'login')
    await openLogin()

    submit()

    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription('Enter your email address.')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.')
    expect(login).not.toHaveBeenCalled()
  })

  // A field's message goes once that field is edited
  it("clears a field's message when that field is edited", async () => {
    await openLogin()
    submit()
    expect(screen.getByLabelText('Email address')).toBeInvalid()

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'somchai.jaidee@kmutt.ac.th' } })

    expect(screen.getByLabelText('Email address')).toBeValid()
    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.')
  })

  // UI-03: pending request -> busy button, disabled fields
  it('disables the fields and shows Sign In busy while the request is pending', async () => {
    let answer: (user: typeof REQUESTER) => void = () => {}
    const login = vi.spyOn(api, 'login').mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await openLogin()

    typeCredentials(REQUESTER.email, 'Correct-Horse-9')
    submit()

    const button = screen.getByRole('button', { name: 'Sign In' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()

    fireEvent.submit(button.closest('form')!)
    expect(login).toHaveBeenCalledTimes(1)

    answer(REQUESTER)
    await waitFor(() => expect(window.location.pathname).toBe('/tickets'))
  })

  // UI-03 (AC-52): network failure -> safe failure alert, values kept
  it.each([
    { failure: new Error('Unable to connect to TokTickIT API'), name: 'a lost connection' },
    {
      failure: new api.ApiError(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR'),
      name: 'a 500',
    },
    { failure: new api.ApiError(502, 'The server was unable to process this request'), name: 'a non-JSON refusal' },
  ])('shows the safe failure alert and keeps both values after $name', async ({ failure }) => {
    vi.spyOn(api, 'login').mockRejectedValue(failure)
    await openLogin()

    typeCredentials('somchai.jaidee@kmutt.ac.th', 'Correct-Horse-9')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByRole('alert')).toHaveClass('tk-alert--error')
    expect(screen.getByLabelText('Email address')).toHaveValue('somchai.jaidee@kmutt.ac.th')
    expect(screen.getByLabelText('Password')).toHaveValue('Correct-Horse-9')
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled()
  })

  // api-spec.md §2: a 400 names the field it refuses
  it("shows the API's message under the field a 400 names", async () => {
    vi.spyOn(api, 'login').mockRejectedValue(
      new api.ApiError(400, 'Email must be at most 254 characters.', 'VALIDATION_ERROR', 'email'),
    )
    await openLogin()

    typeCredentials('somchai.jaidee@kmutt.ac.th', 'Correct-Horse-9')
    submit()

    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        'Email must be at most 254 characters.',
      ),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
