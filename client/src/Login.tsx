import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, login } from './api'
import { InlineAlert, SAFE_FAILURE_MESSAGE } from './feedback'
import PasswordField from './PasswordField'
import { useSession } from './useSession'

interface LoginAlert {
  variant: 'error' | 'warning'
  message: string
}

type FieldErrors = { email?: string; password?: string }

// The refusals of POST /api/auth/login (api-spec.md §2), by `code`. None of
// them says whether the email exists (BR-10).
const REFUSAL_ALERTS: Record<string, LoginAlert> = {
  INVALID_CREDENTIALS: { variant: 'error', message: 'Invalid email or password.' },
  ACCOUNT_INACTIVE: { variant: 'error', message: 'This account is inactive. Contact an administrator.' },
  LOGIN_THROTTLED: { variant: 'warning', message: 'Too many failed sign-in attempts. Try again later.' },
}

const SAFE_FAILURE_ALERT: LoginAlert = { variant: 'error', message: SAFE_FAILURE_MESSAGE }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}

  if (email === '') errors.email = 'Enter your email address.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'
  if (password === '') errors.password = 'Enter your password.'

  return errors
}

// Login (ui-spec.md §5): one card with the wordmark above it and no shell
// header. Where the user goes after signing in is the guards' decision
// (App.tsx): their landing screen, or Change Password.
function Login() {
  const { sessionEnded, signIn } = useSession()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<LoginAlert | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  // Focus returns to Password after invalid credentials.
  useEffect(() => {
    if (alert === REFUSAL_ALERTS.INVALID_CREDENTIALS) passwordRef.current?.focus()
  }, [alert])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const trimmedEmail = email.trim()
    const errors = validate(trimmedEmail, password)
    setFieldErrors(errors)
    setAlert(null)
    if (errors.email || errors.password) {
      ;(errors.email ? emailRef : passwordRef).current?.focus()
      return
    }

    setSubmitting(true)
    try {
      signIn(await login(trimmedEmail, password))
    } catch (err) {
      setSubmitting(false)

      const refusal = err instanceof ApiError && err.code ? REFUSAL_ALERTS[err.code] : undefined
      if (refusal) {
        // After any refused attempt the password is cleared and the email kept.
        setPassword('')
        setAlert(refusal)
      } else if (err instanceof ApiError && err.status === 400 && (err.field === 'email' || err.field === 'password')) {
        setFieldErrors({ [err.field]: err.message })
      } else {
        // A 500 or a lost connection: the fields keep their values.
        setAlert(SAFE_FAILURE_ALERT)
      }
    }
  }

  return (
    <main className="tk-auth-page">
      <div className="tk-auth-page__wordmark">TokTickIT</div>
      <div className="tk-auth-card card">
        <form className="card-body" noValidate onSubmit={handleSubmit}>
          <h1 className="h4 mb-4">Sign in to your account</h1>

          {sessionEnded && <InlineAlert variant="info">Your session has ended. Please sign in again.</InlineAlert>}

          <div className="mb-3">
            <label htmlFor="login-email" className="form-label">
              Email address
            </label>
            <input
              id="login-email"
              ref={emailRef}
              type="email"
              className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
              value={email}
              autoComplete="username"
              disabled={submitting}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              onChange={(event) => {
                setEmail(event.target.value)
                setFieldErrors((errors) => ({ ...errors, email: undefined }))
              }}
            />
            {fieldErrors.email && (
              <div id="login-email-error" className="invalid-feedback">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={(value) => {
              setPassword(value)
              setFieldErrors((errors) => ({ ...errors, password: undefined }))
            }}
            autoComplete="current-password"
            error={fieldErrors.password}
            disabled={submitting}
            inputRef={passwordRef}
          />

          {alert && <InlineAlert variant={alert.variant}>{alert.message}</InlineAlert>}

          <button type="submit" className="btn btn-primary w-100" disabled={submitting} aria-busy={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Sign In
          </button>

          <p className="text-muted small mt-3 mb-0">Forgot your password? Contact an administrator.</p>
        </form>
      </div>
    </main>
  )
}

export default Login
