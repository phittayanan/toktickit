import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  createAdminUser,
  fetchAdminUsers,
  setInitialPassword,
  updateAdminUser,
  type AdminUser,
  type AdminUserInput,
  type Role,
  type UserIdentity,
} from './api'
import { AccountBadge, RoleBadge } from './badges'
import { ConfirmDialog, Dialog } from './dialog'
import { ForbiddenPage, InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'

// How long typing must stop before the search is applied (ui-spec.md §10.1).
const SEARCH_DELAY_MS = 300

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'REQUESTER', label: 'Requester' },
  { value: 'IT_STAFF', label: 'IT Staff' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
]

type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; users: AdminUser[] }
  | { status: 'failed' }
  | { status: 'forbidden' }

// Skeleton rows: the shape of the list while the Users load.
function LoadingRows() {
  return (
    <div className="placeholder-glow" role="status">
      <span className="visually-hidden">Loading users…</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="tk-users__skeleton-row" aria-hidden="true">
          <span className="placeholder col-3" />
          <span className="placeholder col-4" />
          <span className="placeholder col-2" />
        </div>
      ))}
    </div>
  )
}

// A User's name as the list shows it: the signed-in Administrator's own
// row is marked, and a User with no password yet says so underneath.
function NameCell({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  return (
    <>
      <span className="fw-semibold text-break">{user.name}</span>
      {isSelf && <span className="text-muted"> (you)</span>}
      {!user.hasPassword && <div className="text-muted small">No password set</div>}
    </>
  )
}

// Below the desktop breakpoint (ui-spec.md §11) the create and edit panel
// opens as a dialog over the list instead of beside it (§10.3).
const COMPACT_QUERY = '(max-width: 991.98px)'

function useIsCompact(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(COMPACT_QUERY)
      media?.addEventListener('change', onChange)
      return () => media?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(COMPACT_QUERY).matches ?? false,
  )
}

type Field = keyof AdminUserInput
type FieldErrors = Partial<Record<Field, string>>

interface FormValues {
  name: string
  email: string
  role: Role | ''
  isActive: boolean
}

const EMPTY_FORM: FormValues = { name: '', email: '', role: '', isActive: true }

const FIELD_ORDER: Field[] = ['name', 'email', 'role', 'isActive']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The rules of POST /api/admin/users (api-spec.md §7.2, BR-43), checked
// here first so an obvious mistake sends no request.
function validate({ name, email, role }: FormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (name === '') errors.name = 'Full name is required.'
  else if (name.length < 2 || name.length > 100) errors.name = 'Full name must be 2 to 100 characters.'

  if (email === '') errors.email = 'Email address is required.'
  else if (email.length > 254) errors.email = 'Email must be at most 254 characters.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'

  if (role === '') errors.role = 'Select a role.'

  return errors
}

function BusyLabel({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
      {children}
    </>
  )
}

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((option) => [option.value, option.label])) as Record<
  Role,
  string
>

interface Confirmation {
  title: string
  message: string
  confirmLabel: string
  destructive: boolean
}

// What saving `input` over `target` does beyond changing the fields, which
// the Administrator confirms first (ui-spec.md §10.2). Null when the
// change needs no confirmation.
function confirmationFor(target: AdminUser, input: AdminUserInput): Confirmation | null {
  const deactivating = target.isActive && !input.isActive
  const roleChanging = input.role !== target.role

  // BR-25: the Tickets a User who can no longer own any hands back.
  if (deactivating || (roleChanging && input.role === 'REQUESTER')) {
    const owned = target.ownedUnfinishedTicketCount
    const returned =
      owned === 0
        ? ''
        : ` ${owned} unfinished ${owned === 1 ? 'ticket' : 'tickets'} they own will return to the queue as unassigned.`

    return {
      title: deactivating ? 'Deactivate user?' : 'Change role?',
      message: `${target.name} will be signed out.${returned}`,
      confirmLabel: deactivating ? 'Deactivate' : 'Change Role',
      destructive: deactivating,
    }
  }

  if (roleChanging) {
    return {
      title: 'Change role?',
      message: `${target.name} will be signed out and will see the ${ROLE_LABEL[input.role]} navigation at next sign-in.`,
      confirmLabel: 'Change Role',
      destructive: false,
    }
  }

  return null
}

// The create and edit panel (ui-spec.md §10.2): beside the list on
// desktop, a dialog over it below that. `target` is the User being edited,
// or null to create one.
// The refusals of PATCH /api/admin/users/:id that concern the change as a
// whole rather than one field (api-spec.md §7.3), by `code`.
const REFUSAL_ALERTS: Record<string, string> = {
  SELF_DEACTIVATION: 'You cannot deactivate your own account.',
  LAST_ADMINISTRATOR: 'This is the last active administrator. Make another user an administrator first.',
}

function UserPanel({
  target,
  isSelf,
  asDialog,
  onClose,
  onCreated,
  onSaved,
  onIssued,
  onNotFound,
  onForbidden,
}: {
  target: AdminUser | null
  // The User being edited is the signed-in Administrator.
  isSelf: boolean
  asDialog: boolean
  onClose: () => void
  onCreated: (user: AdminUser, initialPassword: string) => void
  onSaved: (user: AdminUser, unassignedTicketCount: number) => void
  // A new Initial Password was set for the User being edited.
  onIssued: (user: AdminUser, initialPassword: string) => void
  // The User being edited no longer exists.
  onNotFound: () => void
  onForbidden: () => void
}) {
  const id = useId()
  const [values, setValues] = useState<FormValues>(
    target ? { name: target.name, email: target.email, role: target.role, isActive: target.isActive } : EMPTY_FORM,
  )
  const [confirmation, setConfirmation] = useState<(Confirmation & { input: AdminUserInput }) | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  // A failure that is not tied to one field, shown at the top of the panel.
  const [alert, setAlert] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingPassword, setConfirmingPassword] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const roleRef = useRef<HTMLSelectElement>(null)
  const activeRef = useRef<HTMLInputElement>(null)
  const title = target ? 'Edit User' : 'Create New User'

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Editing a field removes the message under it.
  const edit = <K extends Field>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }))
  }

  const showFieldErrors = (errors: FieldErrors) => {
    setFieldErrors(errors)
    const firstInvalid = FIELD_ORDER.find((field) => errors[field])
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, role: roleRef, isActive: activeRef }
      refs[firstInvalid].current?.focus()
    }
    return firstInvalid !== undefined
  }

  // What the panel shows for a request the API refused or that failed.
  const showRefusal = (err: unknown) => {
    const refusal = err instanceof ApiError ? err : undefined
    const field = FIELD_ORDER.find((name) => name === refusal?.field)

    if (refusal?.status === 404) {
      onNotFound()
    } else if (refusal?.status === 403 && refusal.code === 'FORBIDDEN') {
      onForbidden()
    } else if (refusal?.code === 'EMAIL_TAKEN') {
      showFieldErrors({ email: 'A user with this email already exists.' })
    } else if (refusal?.status === 400 && field) {
      // The API's message, under the field it names.
      showFieldErrors({ [field]: refusal.message })
    } else if (refusal?.code && REFUSAL_ALERTS[refusal.code]) {
      setAlert(REFUSAL_ALERTS[refusal.code])
    } else if (refusal?.status === 409) {
      // Any other conflict: the API's own `error` text, which is safe to show.
      setAlert(refusal.message)
    } else {
      // A 500 or a lost connection: the fields keep their values.
      setAlert(SAFE_FAILURE_MESSAGE)
    }
  }

  const save = async (input: AdminUserInput) => {
    setSubmitting(true)
    try {
      if (target) {
        const updated = await updateAdminUser(target.id, input)
        onSaved(updated.user, updated.unassignedTicketCount)
      } else {
        const created = await createAdminUser(input)
        // The panel stays as it is, behind the one-time password dialog,
        // until that is done.
        onCreated(created.user, created.initialPassword)
      }
    } catch (err) {
      setSubmitting(false)
      showRefusal(err)
    }
  }

  // BR-39: sets a new Initial Password for the User being edited. It is
  // not a save: the fields stay as they are.
  const issuePassword = async (user: AdminUser) => {
    setIssuing(true)
    setAlert(null)
    try {
      const { initialPassword } = await setInitialPassword(user.id)
      setConfirmingPassword(false)
      onIssued(user, initialPassword)
    } catch (err) {
      setConfirmingPassword(false)
      showRefusal(err)
    } finally {
      setIssuing(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const trimmed = { ...values, name: values.name.trim(), email: values.email.trim() }
    setAlert(null)
    if (showFieldErrors(validate(trimmed))) return

    const input = trimmed as AdminUserInput
    const needed = target && confirmationFor(target, input)
    if (needed) setConfirmation({ ...needed, input })
    else void save(input)
  }

  const describedBy = (field: Field) => (fieldErrors[field] ? `${id}-${field}-error` : undefined)
  const fieldError = (field: Field) =>
    fieldErrors[field] && (
      <div id={`${id}-${field}-error`} className="invalid-feedback d-block">
        {fieldErrors[field]}
      </div>
    )

  const confirmationDialog = confirmation && (
    <ConfirmDialog
      title={confirmation.title}
      confirmLabel={confirmation.confirmLabel}
      destructive={confirmation.destructive}
      onCancel={() => setConfirmation(null)}
      onConfirm={() => {
        setConfirmation(null)
        void save(confirmation.input)
      }}
    >
      {confirmation.message}
    </ConfirmDialog>
  )

  const passwordDialog = target && confirmingPassword && (
    <ConfirmDialog
      title="Set new initial password?"
      confirmLabel="Set New Initial Password"
      busy={issuing}
      onCancel={() => setConfirmingPassword(false)}
      onConfirm={() => void issuePassword(target)}
    >
      {target.name}'s current password will stop working and they will be signed out.
    </ConfirmDialog>
  )

  const form = (
    <form noValidate onSubmit={handleSubmit}>
      {alert && <InlineAlert variant="error">{alert}</InlineAlert>}

      <div className="mb-3">
        <label htmlFor={`${id}-name`} className="form-label tk-required">
          Full Name
        </label>
        <input
          id={`${id}-name`}
          ref={nameRef}
          type="text"
          className={`form-control ${fieldErrors.name ? 'is-invalid' : ''}`}
          value={values.name}
          required
          autoComplete="off"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={describedBy('name')}
          onChange={(event) => edit('name', event.target.value)}
        />
        {fieldError('name')}
      </div>

      <div className="mb-3">
        <label htmlFor={`${id}-email`} className="form-label tk-required">
          Email Address
        </label>
        <input
          id={`${id}-email`}
          ref={emailRef}
          type="email"
          className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
          value={values.email}
          required
          autoComplete="off"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={describedBy('email')}
          onChange={(event) => edit('email', event.target.value)}
        />
        {fieldError('email')}
      </div>

      <div className="mb-3">
        <label htmlFor={`${id}-role`} className="form-label tk-required">
          Role
        </label>
        <select
          id={`${id}-role`}
          ref={roleRef}
          className={`form-select ${fieldErrors.role ? 'is-invalid' : ''}`}
          value={values.role}
          required
          aria-invalid={fieldErrors.role ? true : undefined}
          aria-describedby={describedBy('role')}
          onChange={(event) => edit('role', event.target.value as Role | '')}
        >
          {!target && <option value="">Select a role…</option>}
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldError('role')}
      </div>

      <div className="mb-3">
        <div className="form-check form-switch tk-switch">
          <input
            id={`${id}-active`}
            ref={activeRef}
            type="checkbox"
            role="switch"
            className="form-check-input"
            checked={values.isActive}
            disabled={isSelf}
            aria-describedby={isSelf ? `${id}-active-help` : describedBy('isActive')}
            onChange={(event) => edit('isActive', event.target.checked)}
          />
          <label htmlFor={`${id}-active`} className="form-check-label">
            <span className="form-label mb-0">Active</span>
            <span className="tk-switch__state" aria-hidden="true">
              {values.isActive ? 'Yes' : 'No'}
            </span>
          </label>
        </div>
        {isSelf && (
          <div id={`${id}-active-help`} className="form-text">
            You cannot deactivate your own account.
          </div>
        )}
        {fieldError('isActive')}
      </div>

      {target ? (
        <div className="mb-3">
          <div className="form-label">Password</div>
          {isSelf ? (
            <div className="text-muted">Use Change Password in the menu for your own account.</div>
          ) : (
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={submitting}
              onClick={() => setConfirmingPassword(true)}
            >
              Set New Initial Password
            </button>
          )}
        </div>
      ) : (
        <div className="tk-info-panel mb-3">
          <div className="fw-semibold">Initial Password</div>
          <div>
            A temporary password is generated when you save and shown once. The user must change it at first login.
          </div>
        </div>
      )}

      <div className="tk-users__panel-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
          <BusyLabel busy={submitting}>{target ? 'Save Changes' : 'Save User'}</BusyLabel>
        </button>
        <button type="button" className="btn btn-outline-secondary" disabled={submitting} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )

  if (asDialog) {
    return (
      <Dialog title={title} onDismiss={submitting ? undefined : onClose} className="tk-dialog--panel">
        {form}
        {confirmationDialog}
        {passwordDialog}
      </Dialog>
    )
  }

  return (
    <section className="tk-users__panel card" aria-labelledby={`${id}-title`}>
      <div className="card-body">
        <h2 id={`${id}-title`} className="h5 mb-3">
          {title}
        </h2>
        {form}
        {confirmationDialog}
        {passwordDialog}
      </div>
    </section>
  )
}

// The one-time password dialog (ui-spec.md §10.2). It has no dismiss: only
// Done closes it, so it is not closed by accident.
function OneTimePasswordDialog({ name, password, onDone }: { name: string; password: string; onDone: () => void }) {
  const id = useId()
  const fieldRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // No clipboard access: the password is selected, to be copied by hand.
      fieldRef.current?.select()
    }
  }

  return (
    <Dialog title={`Temporary password for ${name}`}>
      <label htmlFor={id} className="form-label">
        Temporary password
      </label>
      <div className="input-group mb-2">
        <input
          id={id}
          ref={fieldRef}
          type="text"
          className="tk-one-time-password form-control"
          value={password}
          readOnly
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={copy}>
          Copy
        </button>
      </div>
      <div className="tk-one-time-password__copied small" role="status">
        {copied && 'Copied'}
      </div>
      <div className="tk-alert tk-alert--warning">
        This password is shown only once. Give it to the user securely. They must change it when they sign in.
      </div>
      <div className="tk-dialog__actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </Dialog>
  )
}

// User Management (docs/lab-03/ui-spec.md §10): the list of Users, with
// search, a role filter, and an Edit action on each, and the panel that
// creates or edits one.
function UserManagement({
  user: currentUser,
  onSelfSaved,
}: {
  user: UserIdentity
  // The signed-in Administrator saved a change to their own account that
  // leaves them signed in.
  onSelfSaved?: (user: AdminUser) => void
}) {
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [attempt, setAttempt] = useState(0)
  // What the API answered, and for which search, role filter, and attempt.
  // Until the answer for the current ones arrives, the list is loading.
  const requestKey = JSON.stringify([search, role, attempt])
  const [answer, setAnswer] = useState<{ key: string; list: ListState } | null>(null)
  const list: ListState = answer?.key === requestKey ? answer.list : { status: 'loading' }
  // The open panel: creating a User, or editing the one given.
  const [panel, setPanel] = useState<{ target: AdminUser | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // A failure of the panel that closed it, shown above the list.
  const [listAlert, setListAlert] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  // A temporary password, held only until its dialog is done. `created`
  // says it belongs to a User the panel has just created.
  const [issued, setIssued] = useState<{ name: string; password: string; created: boolean } | null>(null)
  const compact = useIsCompact()

  // The search is applied once typing has stopped.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchText.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let cancelled = false

    fetchAdminUsers({ ...(search && { search }), ...(role && { role }) })
      .then((users) => {
        if (!cancelled) setAnswer({ key: requestKey, list: { status: 'loaded', users } })
      })
      .catch((err) => {
        if (cancelled) return
        const forbidden = err instanceof ApiError && err.status === 403 && err.code === 'FORBIDDEN'
        setAnswer({ key: requestKey, list: { status: forbidden ? 'forbidden' : 'failed' } })
      })

    return () => {
      cancelled = true
    }
  }, [search, role, requestKey])

  const clearFilters = () => {
    setSearchText('')
    setSearch('')
    setRole('')
  }

  const reload = () => setAttempt((count) => count + 1)

  const openPanel = (target: AdminUser | null) => {
    setNotice(null)
    setListAlert(null)
    setPanel({ target })
  }

  // Done on the one-time password dialog: the password is discarded here
  // and nothing else holds it.
  const discardIssued = () => {
    if (issued?.created) {
      setPanel(null)
      setNotice('User created.')
    }
    setIssued(null)
    reload()
  }

  const finishEdit = (user: AdminUser, unassignedTicketCount: number) => {
    // BR-14: a change of their own role ends the Administrator's session,
    // so only a change that leaves them signed in is handed up.
    if (user.id === currentUser.id && user.role === currentUser.role) onSelfSaved?.(user)

    const returned =
      unassignedTicketCount === 0
        ? ''
        : ` ${unassignedTicketCount} ${unassignedTicketCount === 1 ? 'ticket' : 'tickets'} returned to the queue as unassigned.`

    setPanel(null)
    setNotice(`Changes saved.${returned}`)
    reload()
  }

  const closeForMissingUser = () => {
    setPanel(null)
    setListAlert('This user could not be found. The list has been reloaded.')
    reload()
  }

  if (forbidden || list.status === 'forbidden') {
    return <ForbiddenPage role={currentUser.role} />
  }

  const openPanelElement = panel && (
    <UserPanel
      // A panel opened for another User starts from that User's values.
      key={panel.target?.id ?? 'create'}
      target={panel.target}
      asDialog={compact}
      onClose={() => setPanel(null)}
      isSelf={panel.target?.id === currentUser.id}
      onCreated={(user, password) => setIssued({ name: user.name, password, created: true })}
      onSaved={finishEdit}
      onIssued={(user, password) => setIssued({ name: user.name, password, created: false })}
      onNotFound={closeForMissingUser}
      onForbidden={() => setForbidden(true)}
    />
  )

  return (
    <div className={`tk-users ${panel && !compact ? 'tk-users--with-panel' : ''}`}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="h3 mb-0">Users</h1>
        <button type="button" className="btn btn-primary" onClick={() => openPanel(null)}>
          Create User
        </button>
      </div>

      {notice && <SuccessNotice>{notice}</SuccessNotice>}
      {listAlert && <InlineAlert variant="error">{listAlert}</InlineAlert>}

      <div className="tk-users__layout">
        <div className="tk-users__list card">
          <div className="card-body">
            <div className="tk-users__controls mb-3">
              <div className="tk-users__search">
                <label htmlFor="users-search" className="visually-hidden">
                  Search users
                </label>
                <input
                  id="users-search"
                  type="search"
                  className="form-control"
                  placeholder="Search by name or email…"
                  value={searchText}
                  maxLength={100}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </div>
              <div className="tk-users__role">
                <label htmlFor="users-role" className="visually-hidden">
                  Role
                </label>
                <select
                  id="users-role"
                  className="form-select"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role | '')}
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-link text-decoration-none text-nowrap" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>

            {list.status === 'loading' && <LoadingRows />}

            {list.status === 'failed' && (
              <>
                <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>
                <button type="button" className="btn btn-outline-primary" onClick={reload}>
                  Retry
                </button>
              </>
            )}

            {list.status === 'loaded' && list.users.length === 0 && (
              <div className="text-center py-5 border rounded">
                <p className="mb-3">No users match your search or filter.</p>
                <button type="button" className="btn btn-outline-primary" onClick={clearFilters}>
                  Clear Filters
                </button>
              </div>
            )}

            {list.status === 'loaded' && list.users.length > 0 && (
              <>
                {/* Desktop and tablet: the five-column table. */}
                <div className="d-none d-md-block">
                  <table className="tk-users__table table align-middle mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Email</th>
                        <th scope="col">Role</th>
                        <th scope="col">Status</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.users.map((user) => (
                        <tr key={user.id}>
                          <td>
                            <NameCell user={user} isSelf={user.id === currentUser.id} />
                          </td>
                          <td className="text-break">{user.email}</td>
                          <td>
                            <RoleBadge role={user.role} />
                          </td>
                          <td>
                            <AccountBadge isActive={user.isActive} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              aria-label={`Edit ${user.name}`}
                              onClick={() => openPanel(user)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: one card per User. */}
                <ul className="list-unstyled d-flex flex-column gap-2 d-md-none mb-0" aria-label="Users">
                  {list.users.map((user) => (
                    <li key={user.id} className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                        <div>
                          <NameCell user={user} isSelf={user.id === currentUser.id} />
                        </div>
                        <AccountBadge isActive={user.isActive} />
                      </div>
                      <div className="text-break mb-2">{user.email}</div>
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <RoleBadge role={user.role} />
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          aria-label={`Edit ${user.name}`}
                          onClick={() => openPanel(user)}
                        >
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        {/* One place for both layouts, so the panel keeps what was typed
            when the width crosses the desktop breakpoint. */}
        {openPanelElement}
      </div>

      {issued && <OneTimePasswordDialog name={issued.name} password={issued.password} onDone={discardIssued} />}
    </div>
  )
}

export default UserManagement
