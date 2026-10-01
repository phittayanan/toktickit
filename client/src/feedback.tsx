import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Role } from './api'
import { landingEntry } from './navigation'

// Shared feedback components (ui-spec.md §2.3).

// What every screen says for a 500 or a lost connection: no status code,
// stack, or server text.
export const SAFE_FAILURE_MESSAGE = 'Something went wrong. Please try again.'

// Inline alert: a full-width message at the top of the card it concerns,
// for a failure that is not tied to one field.
export function InlineAlert({
  variant,
  children,
}: {
  variant: 'error' | 'warning' | 'info' | 'success'
  children: ReactNode
}) {
  return (
    <div className={`tk-alert tk-alert--${variant}`} role="alert">
      {children}
    </div>
  )
}

// Success notice: confirms a completed action without blocking the page.
export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="tk-alert tk-alert--success" role="status">
      {children}
    </div>
  )
}

// Forbidden page: shown inside the shell for a path of another Role.
export function ForbiddenPage({ role }: { role: Role }) {
  const navigate = useNavigate()
  const landing = landingEntry(role)

  return (
    <div className="tk-feedback-page card mx-auto text-center">
      <div className="card-body">
        <h1 className="h4 mb-2">You don't have access to this page</h1>
        <p className="text-muted mb-3">This page is not available for your role.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate(landing.path)}>
          Go to {landing.label}
        </button>
      </div>
    </div>
  )
}

// Not Found page: shown inside the shell for an unknown path, with a link
// back to the list the Role lands on.
export function NotFoundPage({ role, title = "We couldn't find that page" }: { role: Role; title?: string }) {
  const landing = landingEntry(role)

  return (
    <div className="tk-feedback-page card mx-auto text-center">
      <div className="card-body">
        <h1 className="h4 mb-3">{title}</h1>
        <Link to={landing.path}>Back to {landing.label}</Link>
      </div>
    </div>
  )
}
