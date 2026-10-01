import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError, changePassword, type ChangePasswordInput, type UserIdentity } from './api'
import { InlineAlert, SAFE_FAILURE_MESSAGE } from './feedback'
import { LANDING_PATH } from './navigation'
import { firstUnmetRuleMessage, PASSWORD_CHECKLIST } from './passwordRules'
import PasswordField from './PasswordField'
import { useSession } from './useSession'

// The "Password must:" panel: one line per rule, updated on every
// keystroke. Each line pairs its dot or check with text, so the state
// never relies on colour alone.
function PasswordChecklist({ password }: { password: string }) {
  return (
    <div className="tk-checklist mb-3" role="group" aria-labelledby="password-checklist-title">
      <div id="password-checklist-title" className="tk-checklist__title">
        Password must:
      </div>
      <ul className="list-unstyled mb-0">
        {PASSWORD_CHECKLIST.map((rule) => {
          const met = rule.met(password)
          return (
            <li key={rule.label} className={`tk-checklist__rule ${met ? 'tk-checklist__rule--met' : ''}`}>
              <span className="tk-checklist__mark" aria-hidden="true" />
              <span className="visually-hidden">{met ? 'Met: ' : 'Not met: '}</span>
              {rule.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type FieldErrors = Partial<Record<keyof ChangePasswordInput, string>>

const FIELD_ORDER: (keyof ChangePasswordInput)[] = ['currentPassword', 'newPassword', 'confirmPassword']

// The same rules, in the same words, as POST /api/auth/change-password
// (api-spec.md §2), so a message reads the same whichever side raised it.
function validate({ currentPassword, newPassword, confirmPassword }: ChangePasswordInput): FieldErrors {
  const errors: FieldErrors = {}

  if (currentPassword === '') errors.currentPassword = 'Current password is required.'

  if (newPassword === '') errors.newPassword = 'New password is required.'
  else {
    const unmet = firstUnmetRuleMessage(newPassword)
    if (unmet) errors.newPassword = unmet
    else if (newPassword === currentPassword) {
      errors.newPassword = 'New password must differ from the current password.'
    }
  }

  if (confirmPassword === '') errors.confirmPassword = 'Confirm the new password.'
  else if (confirmPassword !== newPassword) {
    errors.confirmPassword = 'Confirmation does not match the new password.'
  }

  return errors
}

// Change Password (ui-spec.md §6). Mandatory while the User must change
// their password, voluntary when opened from the user menu.
function ChangePassword({ user }: { user: UserIdentity }) {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const mandatory = user.mustChangePassword
  // Voluntary mode returns to the screen it was opened from (the user menu
  // names it); the landing screen otherwise, and always in mandatory mode.
  const from = (location.state as { from?: string } | null)?.from
  const returnPath = !mandatory && from ? from : LANDING_PATH[user.role]
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failed, setFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  // Editing a field removes the message under it.
  const editing = (field: keyof ChangePasswordInput, setValue: (value: string) => void) => (value: string) => {
    setValue(value)
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }))
  }

  const showFieldErrors = (errors: FieldErrors) => {
    setFieldErrors(errors)
    const firstInvalid = FIELD_ORDER.find((field) => errors[field])
    if (firstInvalid) {
      const refs = { currentPassword: currentRef, newPassword: newRef, confirmPassword: confirmRef }
      refs[firstInvalid].current?.focus()
    }
    return firstInvalid !== undefined
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const input = { currentPassword, newPassword, confirmPassword }
    setFailed(false)
    if (showFieldErrors(validate(input))) return

    setSubmitting(true)
    try {
      const changed = await changePassword(input)
      signIn(changed)
      navigate(returnPath, { replace: true, state: { notice: 'Password changed.' } })
    } catch (err) {
      setSubmitting(false)

      const field = err instanceof ApiError && err.status === 400 && FIELD_ORDER.find((name) => name === err.field)
      if (field) {
        // The API's message, under the field it names; the others keep
        // their values.
        showFieldErrors({ [field]: err.message })
      } else {
        setFailed(true)
      }
    }
  }

  return (
    <div className="tk-change-password card mx-auto">
      <form className="card-body" noValidate onSubmit={handleSubmit}>
        <h1 className={`h4 ${mandatory ? 'mb-1' : 'mb-3'}`}>Change Password</h1>
        {mandatory && <p className="text-muted mb-3">You must change your password to continue.</p>}

        {failed && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}

        <PasswordField
          id="current-password"
          label={mandatory ? 'Current (temporary) password' : 'Current password'}
          value={currentPassword}
          onChange={editing('currentPassword', setCurrentPassword)}
          autoComplete="current-password"
          error={fieldErrors.currentPassword}
          inputRef={currentRef}
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={editing('newPassword', setNewPassword)}
          autoComplete="new-password"
          error={fieldErrors.newPassword}
          inputRef={newRef}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={editing('confirmPassword', setConfirmPassword)}
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          inputRef={confirmRef}
        />

        <PasswordChecklist password={newPassword} />

        <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
          {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {mandatory ? 'Continue' : 'Change Password'}
        </button>
        {!mandatory && (
          <button
            type="button"
            className="btn btn-outline-secondary ms-2"
            disabled={submitting}
            onClick={() => navigate(returnPath, { replace: true })}
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  )
}

export default ChangePassword
