import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  createActionTaken,
  fetchActionsTaken,
  updateActionTaken,
  type ActionTaken,
  type ActionTakenFields,
  type EligibleOwner,
  type UserIdentity,
} from './api'
import { ActionStatusBadge, FollowUpBadge } from './badges'
import { Dialog } from './dialog'
import { ConflictNotice, InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'
import { ACTION_STATUS_LABELS } from './statusLabels'

const TEXT_MAX_LENGTH = 2000
const ATTACHMENT_NOTES_MAX_LENGTH = 500

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// The value of a date and time input: local time, to the minute.
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000

  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

// How a save or a Cancel action was refused (ui-spec.md §8.8).
type Refusal =
  | { kind: 'changed' }
  | { kind: 'conflict' }
  // A refusal the API explains in its own, displayable words.
  | { kind: 'refused'; message: string; field?: string }
  | { kind: 'failure' }

function refusalOf(err: unknown): Refusal {
  if (!(err instanceof ApiError)) return { kind: 'failure' }
  if (err.code === 'ACTION_TAKEN_CHANGED') return { kind: 'changed' }
  if (err.status === 409) return { kind: 'conflict' }
  if ([400, 403, 404].includes(err.status)) return { kind: 'refused', message: err.message, field: err.field }

  return { kind: 'failure' }
}

function RefusalAlert({ refusal, onReload }: { refusal: Refusal; onReload: () => void }) {
  if (refusal.kind === 'conflict') return <ConflictNotice />
  if (refusal.kind === 'changed') {
    return (
      <InlineAlert variant="warning">
        <p className="mb-2">This action was changed by someone else. Reload to see the latest version.</p>
        <button type="button" className="btn btn-outline-secondary" onClick={onReload}>
          Reload
        </button>
      </InlineAlert>
    )
  }

  return <InlineAlert variant="error">{refusal.kind === 'refused' ? refusal.message : SAFE_FAILURE_MESSAGE}</InlineAlert>
}

function Busy({ when }: { when: boolean }) {
  return when ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null
}

interface FormValues {
  actionAt: string
  description: string
  result: string
  status: 'PLANNED' | 'DONE'
  assigneeId: string
  followUpRequired: boolean
  followUpNote: string
  attachmentNotes: string
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

// In the order of the form, which is the order focus looks for one.
const MESSAGE_FIELDS: (keyof FormValues)[] = [
  'actionAt',
  'description',
  'result',
  'assigneeId',
  'followUpNote',
  'attachmentNotes',
]

// The form that is open: Add, or Edit or Mark Done on one action.
type OpenForm = { mode: 'create' } | { mode: 'edit' | 'done'; action: ActionTaken }

function initialValues(open: OpenForm, user: UserIdentity): FormValues {
  const now = new Date()
  if (open.mode === 'create') {
    return {
      actionAt: toLocalInput(now),
      description: '',
      result: '',
      status: 'PLANNED',
      assigneeId: String(user.id),
      followUpRequired: false,
      followUpNote: '',
      attachmentNotes: '',
    }
  }

  const { action } = open
  const actionAt = new Date(action.actionAt)

  return {
    actionAt: toLocalInput(open.mode === 'done' && actionAt > now ? now : actionAt),
    description: action.description,
    result: action.result ?? '',
    status: open.mode === 'done' ? 'DONE' : 'PLANNED',
    assigneeId: String(action.assignee.id),
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? '',
    attachmentNotes: action.attachmentNotes ?? '',
  }
}

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  const description = values.description.trim()
  const result = values.result.trim()
  const note = values.followUpNote.trim()

  if (values.actionAt === '') errors.actionAt = 'Date/Time is required.'
  if (description === '') errors.description = 'Description is required.'
  else if (description.length > TEXT_MAX_LENGTH) {
    errors.description = `Description must be at most ${TEXT_MAX_LENGTH} characters.`
  }
  if (values.status === 'DONE' && result === '') errors.result = 'Result is required for a Done action.'
  else if (result.length > TEXT_MAX_LENGTH) errors.result = `Result must be at most ${TEXT_MAX_LENGTH} characters.`
  if (values.followUpRequired && note === '') errors.followUpNote = 'Follow-up note is required.'
  else if (note.length > TEXT_MAX_LENGTH) {
    errors.followUpNote = `Follow-up note must be at most ${TEXT_MAX_LENGTH} characters.`
  }
  if (values.attachmentNotes.trim().length > ATTACHMENT_NOTES_MAX_LENGTH) {
    errors.attachmentNotes = `Attachment notes must be at most ${ATTACHMENT_NOTES_MAX_LENGTH} characters.`
  }

  return errors
}

// What goes to the API: trimmed, with an empty optional text as null, and
// the time an edit did not touch still to the second.
function toFields(values: FormValues, loaded: ActionTaken | null): ActionTakenFields {
  const unchanged = loaded && values.actionAt === toLocalInput(new Date(loaded.actionAt))

  return {
    actionAt: unchanged ? loaded.actionAt : new Date(values.actionAt).toISOString(),
    description: values.description.trim(),
    result: values.result.trim() || null,
    status: values.status,
    assigneeId: Number(values.assigneeId),
    followUpRequired: values.followUpRequired,
    followUpNote: values.followUpRequired ? values.followUpNote.trim() : null,
    attachmentNotes: values.attachmentNotes.trim() || null,
  }
}

// The eligible users, plus the current assignee when they are no longer one
// of them (BR-04). An empty list means the users could not be loaded, which
// says nothing about the assignee.
function performerOptions(owners: EligibleOwner[], current: { id: number; name: string }) {
  if (owners.some((owner) => owner.id === current.id)) return owners
  const name = owners.length > 0 ? `${current.name} (no longer eligible)` : current.name

  return [{ id: current.id, name }, ...owners]
}

// A label, its control, and the message and counter below it.
function FormField({
  label,
  name,
  required = false,
  error,
  count,
  children,
}: {
  label: string
  name: keyof FormValues
  required?: boolean
  error?: string
  count?: string
  children: ReactNode
}) {
  return (
    <div className="col-lg-6">
      <label htmlFor={`action-${name}`} className={`form-label ${required ? 'tk-required' : ''}`}>
        {label}
      </label>
      {children}
      <div className="d-flex justify-content-between gap-3 mt-1">
        <div id={`action-${name}-error`} className="invalid-feedback d-block">
          {error}
        </div>
        {count && (
          <div id={`action-${name}-count`} className="tk-comments__count text-muted small">
            {count}
          </div>
        )}
      </div>
    </div>
  )
}

// The form of ui-spec.md §8.4, for Add, Edit, and Mark Done. It never
// closes on a refusal, so what was typed is kept. Mount it with the version
// it opens as its `key`, so a Reload starts it again from the latest one.
function ActionForm({
  open,
  user,
  owners,
  onSubmit,
  onCancel,
  onReload,
}: {
  open: OpenForm
  user: UserIdentity
  owners: EligibleOwner[]
  // Null when it was saved, and the form is about to close.
  onSubmit: (fields: ActionTakenFields, clientRequestId: string) => Promise<Refusal | null>
  onCancel: () => void
  // False when the latest version could not be loaded.
  onReload: () => Promise<boolean>
}) {
  const [values, setValues] = useState(() => initialValues(open, user))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [saving, setSaving] = useState(false)
  // BR-14: one key for one body, so a retry cannot create a second record
  // and a corrected body is never taken for a repeat.
  const clientRequestId = useRef(crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)
  const action = open.mode === 'create' ? null : open.action
  const markingDone = open.mode === 'done'
  // Someone finished the action or the Ticket: Save cannot succeed any more.
  const blocked = refusal?.kind === 'conflict'
  const title = { create: 'Add action', edit: 'Edit action', done: 'Mark action Done' }[open.mode]

  const focusField = (name: keyof FormValues) => {
    const field = formRef.current?.elements.namedItem(name)
    if (field instanceof HTMLElement) field.focus()
  }

  useEffect(() => {
    focusField(markingDone ? 'result' : 'actionAt')
  }, [markingDone])

  const change = (patch: Partial<FormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch) as (keyof FormValues)[]) delete next[key]

      return next
    })
    clientRequestId.current = crypto.randomUUID()
  }

  const showErrors = (found: FieldErrors) => {
    setErrors(found)
    const first = MESSAGE_FIELDS.find((name) => found[name])
    if (first) focusField(first)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || blocked) return

    setRefusal(null)
    const invalid = validate(values)
    showErrors(invalid)
    if (Object.keys(invalid).length > 0) return

    setSaving(true)
    const outcome = await onSubmit(toFields(values, action), clientRequestId.current)
    // Saved: the form is gone, and so is its state.
    if (outcome === null) return
    setSaving(false)
    const field = outcome.kind === 'refused' ? MESSAGE_FIELDS.find((name) => name === outcome.field) : undefined
    if (field && outcome.kind === 'refused') showErrors({ [field]: outcome.message })
    else setRefusal(outcome)
  }

  const reload = async () => {
    setRefusal(null)
    if (!(await onReload())) setRefusal({ kind: 'failure' })
  }

  const describedBy = (name: keyof FormValues, ...extra: string[]) =>
    [...extra, `action-${name}-error`].join(' ')
  const textProps = (name: keyof FormValues) => ({
    id: `action-${name}`,
    name,
    readOnly: saving,
    'aria-invalid': errors[name] !== undefined,
    className: `form-control ${errors[name] ? 'is-invalid' : ''}`,
  })

  return (
    <form ref={formRef} noValidate aria-label={title} className="tk-actions__form" onSubmit={handleSubmit}>
      {refusal && <RefusalAlert refusal={refusal} onReload={reload} />}
      <div className="row g-3">
        <FormField label="Date/Time" name="actionAt" required error={errors.actionAt}>
          <input
            {...textProps('actionAt')}
            type="datetime-local"
            value={values.actionAt}
            aria-required="true"
            aria-describedby={describedBy('actionAt')}
            onChange={(event) => change({ actionAt: event.target.value })}
          />
        </FormField>
        <FormField
          label="Description"
          name="description"
          required
          error={errors.description}
          count={`${values.description.trim().length} / ${TEXT_MAX_LENGTH}`}
        >
          <textarea
            {...textProps('description')}
            rows={3}
            value={values.description}
            aria-required="true"
            aria-describedby={describedBy('description', 'action-description-count')}
            onChange={(event) => change({ description: event.target.value })}
          />
        </FormField>
        <FormField
          label="Result"
          name="result"
          required={values.status === 'DONE'}
          error={errors.result}
          count={`${values.result.trim().length} / ${TEXT_MAX_LENGTH}`}
        >
          <textarea
            {...textProps('result')}
            rows={3}
            value={values.result}
            aria-required={values.status === 'DONE'}
            aria-describedby={describedBy('result', 'action-result-count')}
            onChange={(event) => change({ result: event.target.value })}
          />
        </FormField>
        <FormField label="Status" name="status">
          <select
            id="action-status"
            name="status"
            className="form-select"
            value={values.status}
            disabled={saving || markingDone}
            aria-describedby={describedBy('status')}
            onChange={(event) => change({ status: event.target.value as FormValues['status'] })}
          >
            <option value="PLANNED">{ACTION_STATUS_LABELS.PLANNED}</option>
            <option value="DONE">{ACTION_STATUS_LABELS.DONE}</option>
          </select>
        </FormField>
        <FormField label="Performed by" name="assigneeId" error={errors.assigneeId}>
          <select
            id="action-assigneeId"
            name="assigneeId"
            className={`form-select ${errors.assigneeId ? 'is-invalid' : ''}`}
            value={values.assigneeId}
            disabled={saving}
            aria-invalid={errors.assigneeId !== undefined}
            aria-describedby={describedBy('assigneeId')}
            onChange={(event) => change({ assigneeId: event.target.value })}
          >
            {performerOptions(owners, action?.assignee ?? user).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Attachment notes"
          name="attachmentNotes"
          error={errors.attachmentNotes}
          count={`${values.attachmentNotes.trim().length} / ${ATTACHMENT_NOTES_MAX_LENGTH}`}
        >
          <input
            {...textProps('attachmentNotes')}
            type="text"
            value={values.attachmentNotes}
            aria-describedby={describedBy('attachmentNotes', 'action-attachment-help', 'action-attachmentNotes-count')}
            onChange={(event) => change({ attachmentNotes: event.target.value })}
          />
          <div id="action-attachment-help" className="form-text">
            Which file or image to look at
          </div>
        </FormField>
        <div className="col-12">
          <div className="form-check">
            <input
              id="action-followUpRequired"
              name="followUpRequired"
              type="checkbox"
              className="form-check-input"
              checked={values.followUpRequired}
              disabled={saving}
              onChange={(event) => change({ followUpRequired: event.target.checked, followUpNote: '' })}
            />
            <label htmlFor="action-followUpRequired" className="form-check-label">
              Follow-up required
            </label>
          </div>
        </div>
        {values.followUpRequired && (
          <FormField
            label="Follow-up note"
            name="followUpNote"
            required
            error={errors.followUpNote}
            count={`${values.followUpNote.trim().length} / ${TEXT_MAX_LENGTH}`}
          >
            <textarea
              {...textProps('followUpNote')}
              rows={3}
              value={values.followUpNote}
              aria-required="true"
              aria-describedby={describedBy('followUpNote', 'action-followUpNote-count')}
              onChange={(event) => change({ followUpNote: event.target.value })}
            />
          </FormField>
        )}
      </div>
      <div className="tk-actions__form-buttons">
        <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || blocked} aria-busy={saving}>
          <Busy when={saving} />
          {markingDone ? 'Mark Done' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// The Destructive confirmation of ui-spec.md §8.5. It stays open on a
// refusal, with the alert inside it; only a failure can be confirmed again.
function CancelActionDialog({
  onConfirm,
  onDismiss,
  onReload,
}: {
  // Null when it was saved, and the dialog is about to close.
  onConfirm: () => Promise<Refusal | null>
  // `refused`: the list may no longer be as this screen shows it.
  onDismiss: (refused: boolean) => void
  onReload: () => void
}) {
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [busy, setBusy] = useState(false)
  const dismiss = () => onDismiss(refusal !== null)

  const confirm = async () => {
    setBusy(true)
    setRefusal(null)
    const outcome = await onConfirm()
    if (outcome === null) return
    setBusy(false)
    setRefusal(outcome)
  }

  return (
    <Dialog title="Cancel action" onDismiss={busy ? undefined : dismiss} dismissOnBackdrop>
      {refusal && <RefusalAlert refusal={refusal} onReload={onReload} />}
      <p>Cancel this action? It stays on the ticket as Cancelled and can no longer be changed.</p>
      <div className="tk-dialog__actions">
        <button type="button" className="btn btn-outline-secondary tk-actions__keep" disabled={busy} onClick={dismiss}>
          Keep action
        </button>
        <button
          type="button"
          className="btn btn-outline-danger"
          disabled={busy || (refusal !== null && refusal.kind !== 'failure')}
          aria-busy={busy}
          onClick={confirm}
        >
          <Busy when={busy} />
          Cancel action
        </button>
      </div>
    </Dialog>
  )
}

// View mode (ui-spec.md §8.3): every field, read-only.
function ActionDetails({ action }: { action: ActionTaken }) {
  const fields: [string, ReactNode][] = [
    ['Action Date/Time', formatDateTime(action.actionAt)],
    ['Action Description', action.description],
    ['Result', action.result ?? '—'],
    ['Performed by', action.assignee.name],
    ['Status', ACTION_STATUS_LABELS[action.status]],
    ['Follow-Up Required?', action.followUpRequired ? 'Yes' : 'No'],
    ['Follow-up Note', action.followUpNote ?? '—'],
    ['Attachment Notes', action.attachmentNotes ?? '—'],
    ['Created by', action.createdBy.name],
    ['Created at', formatDateTime(action.createdAt)],
  ]

  return (
    <div role="region" aria-label={`Details of ${action.description}`}>
      <dl className="tk-actions__details">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// The Actions Taken card (docs/lab-04/ui-spec.md §8), the same on both Ticket
// Detail screens. `staff` is what the staff screen adds to it; without it the
// card is the Requester's read-only view. `onChanged` says a Ticket Change
// was made or refused, so the Ticket shown is due a reload.
function ActionsTaken({
  ticketId,
  finishedAs,
  staff,
}: {
  ticketId: number
  finishedAs?: 'closed' | 'cancelled'
  staff?: { user: UserIdentity; owners: EligibleOwner[]; onChanged: () => void }
}) {
  const [actions, setActions] = useState<ActionTaken[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [opened, setOpened] = useState<number[]>([])
  const [form, setForm] = useState<OpenForm | null>(null)
  const [cancelling, setCancelling] = useState<ActionTaken | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  // Only the latest load may fill the list.
  const latestLoad = useRef(0)
  // The control focus returns to when the form or confirmation closes, and
  // the row to fall back on when that control went with the Planned status.
  const returnFocus = useRef<{ control: string; row?: number } | null>(null)
  const canChange = staff !== undefined && finishedAs === undefined
  const busy = form !== null

  const load = useCallback(async (): Promise<ActionTaken[] | null> => {
    latestLoad.current += 1
    const current = latestLoad.current
    try {
      const loaded = await fetchActionsTaken(ticketId)
      if (current === latestLoad.current) {
        setActions(loaded)
        setLoadError(null)
      }

      return loaded
    } catch (err) {
      if (current === latestLoad.current) {
        const refused = err instanceof ApiError && (err.status === 403 || err.status === 404)
        setLoadError(refused ? err.message : SAFE_FAILURE_MESSAGE)
      }

      return null
    }
  }, [ticketId])

  // A Ticket that finished on this screen turns every `canEdit` false.
  useEffect(() => {
    void load()
  }, [load, finishedAs])

  // `#actions-taken` is where the dashboards link to (ui-spec.md §6.1).
  useEffect(() => {
    if (window.location.hash === '#actions-taken') cardRef.current?.scrollIntoView?.()
  }, [])

  useLayoutEffect(() => {
    if (form !== null || cancelling !== null || returnFocus.current === null) return
    const { control, row } = returnFocus.current
    returnFocus.current = null
    const card = cardRef.current
    const target =
      card?.querySelector<HTMLElement>(`[data-return-focus="${control}"]:not(:disabled)`) ??
      card?.querySelector<HTMLElement>(`[data-disclosure="${row}"]`) ??
      card
    target?.focus()
  }, [form, cancelling])

  const open = (next: OpenForm, control: string) => {
    returnFocus.current = { control, row: next.mode === 'create' ? undefined : next.action.id }
    setNotice(null)
    setForm(next)
  }

  const closeForm = () => setForm(null)

  const retryLoad = () => {
    setLoadError(null)
    void load()
  }

  // Sends one change. A saved one reloads the list before the form closes, so
  // focus finds the row as it now stands.
  const send = async (request: () => Promise<ActionTaken>, saved: string): Promise<Refusal | null> => {
    try {
      await request()
    } catch (err) {
      const refusal = refusalOf(err)
      if (refusal.kind === 'conflict') {
        void load()
        staff?.onChanged()
      }

      return refusal
    }
    await load()
    staff?.onChanged()
    setNotice(saved)

    return null
  }

  const submitForm = (open: OpenForm) => async (fields: ActionTakenFields, clientRequestId: string) => {
    const outcome =
      open.mode === 'create'
        ? await send(() => createActionTaken(ticketId, { ...fields, clientRequestId }), 'Action added.')
        : await send(
            () => updateActionTaken(ticketId, open.action.id, { ...fields, expectedVersion: open.action.version }),
            open.mode === 'done' ? 'Action marked Done.' : 'Action updated.',
          )
    if (outcome === null) closeForm()

    return outcome
  }

  // Reload of the Action conflict notice: the latest version, or the row
  // when the action is no longer Planned.
  const reloadForm = (open: OpenForm) => async () => {
    const loaded = await load()
    if (loaded === null || open.mode === 'create') return loaded !== null
    const latest = loaded.find((action) => action.id === open.action.id)
    if (latest?.status === 'PLANNED') setForm({ ...open, action: latest })
    else closeForm()

    return true
  }

  // The record unchanged, with status CANCELLED (ui-spec.md §8.5).
  const confirmCancel = async (action: ActionTaken) => {
    const outcome = await send(
      () =>
        updateActionTaken(ticketId, action.id, {
          expectedVersion: action.version,
          actionAt: action.actionAt,
          description: action.description,
          result: action.result,
          status: 'CANCELLED',
          assigneeId: action.assignee.id,
          followUpRequired: action.followUpRequired,
          followUpNote: action.followUpNote,
          attachmentNotes: action.attachmentNotes,
        }),
      'Action cancelled.',
    )
    if (outcome === null) setCancelling(null)

    return outcome
  }

  const toggle = (id: number) =>
    setOpened((prev) => (prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]))

  const renderForm = (current: OpenForm) =>
    staff && (
      <ActionForm
        key={current.mode === 'create' ? 'create' : `${current.action.id}-${current.action.version}`}
        open={current}
        user={staff.user}
        owners={staff.owners}
        onSubmit={submitForm(current)}
        onCancel={closeForm}
        onReload={reloadForm(current)}
      />
    )

  const columns = canChange ? 4 : 3

  return (
    <section
      ref={cardRef}
      id="actions-taken"
      tabIndex={-1}
      className="tk-actions card"
      aria-labelledby="actions-taken-title"
    >
      <div className="card-body">
        <div className="tk-actions__header d-flex justify-content-between align-items-center gap-3 mb-3">
          <h2 id="actions-taken-title" className="h5 mb-0">
            Actions Taken{actions && ` (${actions.length})`}
          </h2>
          {canChange && (
            <button
              type="button"
              className="btn btn-primary"
              data-return-focus="add"
              disabled={busy}
              onClick={() => open({ mode: 'create' }, 'add')}
            >
              Add
            </button>
          )}
        </div>
        <p className="tk-thread__strip tk-thread__strip--info">
          {staff ? 'Visible to the Requester and IT Staff.' : 'Visible to you and IT Staff.'}
        </p>
        {staff && finishedAs && (
          <p className="tk-comments__finished">
            This ticket is {finishedAs}. Its actions can no longer be changed.
          </p>
        )}
        {notice && <SuccessNotice>{notice}</SuccessNotice>}
        {loadError && (
          <InlineAlert variant="error">
            {loadError}{' '}
            <button type="button" className="btn btn-link p-0 align-baseline" onClick={retryLoad}>
              Retry
            </button>
          </InlineAlert>
        )}
        {form?.mode === 'create' && <div className="mb-3">{renderForm(form)}</div>}

        {actions === null && loadError === null && (
          <div role="status">
            <span className="visually-hidden">Loading actions…</span>
            <div aria-hidden="true">
              <div className="tk-skeleton" />
              <div className="tk-skeleton" />
              <div className="tk-skeleton" />
            </div>
          </div>
        )}

        {actions?.length === 0 && (
          <p className="text-muted mb-0">
            {staff ? 'No actions recorded yet.' : 'IT Staff have not recorded any actions yet.'}
          </p>
        )}

        {actions !== null && actions.length > 0 && (
          <table className="table align-middle mb-0 tk-actions__table">
            <thead>
              <tr>
                <th scope="col" className="tk-actions__date">
                  Date
                </th>
                <th scope="col">Description</th>
                <th scope="col" className="tk-actions__status">
                  Status
                </th>
                {canChange && (
                  <th scope="col" className="tk-actions__buttons-column">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => {
                const editing = form !== null && form.mode !== 'create' && form.action.id === action.id
                if (editing) {
                  return (
                    <tr key={action.id} className="tk-actions__wide-row">
                      <td colSpan={columns}>{renderForm(form)}</td>
                    </tr>
                  )
                }

                const expanded = opened.includes(action.id)

                return (
                  <Fragment key={action.id}>
                    <tr className="tk-actions__row">
                      <td>{formatDateTime(action.actionAt)}</td>
                      <td className="tk-actions__description-cell">
                        <button
                          type="button"
                          className="tk-actions__disclosure"
                          title={action.description}
                          data-disclosure={action.id}
                          aria-expanded={expanded}
                          onClick={() => toggle(action.id)}
                        >
                          {action.description}
                        </button>
                      </td>
                      <td>
                        <div className="tk-actions__badges">
                          <ActionStatusBadge status={action.status} />
                          {action.followUpRequired && <FollowUpBadge />}
                        </div>
                      </td>
                      {canChange && (
                        <td className="tk-actions__buttons-cell">
                          {action.canEdit && (
                            <div className="tk-actions__buttons">
                              <button
                                type="button"
                                className="btn btn-link btn-sm"
                                data-return-focus={`edit-${action.id}`}
                                disabled={busy}
                                onClick={() => open({ mode: 'edit', action }, `edit-${action.id}`)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm"
                                data-return-focus={`done-${action.id}`}
                                disabled={busy}
                                onClick={() => open({ mode: 'done', action }, `done-${action.id}`)}
                              >
                                Mark Done
                              </button>
                              <button
                                type="button"
                                className="btn btn-link btn-sm text-danger"
                                data-return-focus={`cancel-${action.id}`}
                                disabled={busy}
                                onClick={() => {
                                  returnFocus.current = { control: `cancel-${action.id}`, row: action.id }
                                  setNotice(null)
                                  setCancelling(action)
                                }}
                              >
                                Cancel action
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="tk-actions__wide-row">
                        <td colSpan={columns}>
                          <ActionDetails action={action} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {cancelling && (
        <CancelActionDialog
          onConfirm={() => confirmCancel(cancelling)}
          onDismiss={(refused) => {
            setCancelling(null)
            if (refused) void load()
          }}
          onReload={() => {
            setCancelling(null)
            void load()
          }}
        />
      )}
    </section>
  )
}

export default ActionsTaken
