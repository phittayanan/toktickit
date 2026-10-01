import { useState, type Ref } from 'react'

// A password input with its label, its show/hide icon button (a real
// button whose accessible name reflects its state, ui-spec.md §12), and
// its field-level message directly below.
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  disabled,
  inputRef,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
}) {
  const [shown, setShown] = useState(false)
  const errorId = `${id}-error`
  const toggleLabel = `${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <div className="input-group has-validation">
        <input
          id={id}
          ref={inputRef}
          type={shown ? 'text' : 'password'}
          className={`form-control ${error ? 'is-invalid' : ''}`}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="tk-password-toggle btn btn-outline-secondary"
          aria-label={toggleLabel}
          aria-pressed={shown}
          title={toggleLabel}
          disabled={disabled}
          onClick={() => setShown((wasShown) => !wasShown)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M3 3l18 18" />}
          </svg>
        </button>
        {error && (
          <div id={errorId} className="invalid-feedback">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default PasswordField
