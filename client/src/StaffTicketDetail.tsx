import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  ApiError,
  downloadAttachment,
  fetchEligibleOwners,
  fetchStaffTicket,
  updateItPriority,
  updateTicketOwner,
  updateTicketStatus,
  type EligibleOwner,
  type Priority,
  type StaffTicket,
  type TicketStatus,
  type UserIdentity,
} from './api'
import { AccountBadge, AppearsResolvedBadge, PriorityBadge, StatusBadge } from './badges'
import EntryThread from './EntryThread'
import { statusLabel } from './statusLabels'
import { ConfirmDialog, Dialog } from './dialog'
import {
  ConflictNotice,
  ForbiddenPage,
  InlineAlert,
  NotFoundPage,
  SAFE_FAILURE_MESSAGE,
  SuccessNotice,
} from './feedback'

const QUEUE = { label: 'Ticket Queue', path: '/staff/queue' }

// A Closed or Cancelled Ticket is finished, and read-only (BR-31).
const FINISHED_AS: Partial<Record<TicketStatus, 'closed' | 'cancelled'>> = { CLOSED: 'closed', CANCELLED: 'cancelled' }

// The Actions Taken card, where the status control sends a user who cannot
// resolve yet (Lab 4 ui-spec.md §9).
const ACTIONS_TAKEN_ID = 'actions-taken'

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH']
const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }

// How loading the Ticket ended (ui-spec.md §9.6).
type Detail =
  | { status: 'loading' }
  | { status: 'loaded'; ticket: StaffTicket }
  | { status: 'not-found' }
  | { status: 'forbidden' }
  | { status: 'failed' }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

// The view the Ticket Queue was showing when it opened this Ticket, which
// it passes along so that going back restores it (ui-spec.md §9.1).
function queuePathFrom(state: unknown): string {
  const search = (state as { queueSearch?: unknown } | null)?.queueSearch

  return typeof search === 'string' && search !== '' ? `${QUEUE.path}?${search}` : QUEUE.path
}

export function StaffTicketNotFound({ user }: { user: UserIdentity }) {
  return <NotFoundPage role={user.role} title="Ticket not found" back={QUEUE} />
}

// A value of the Ticket information card: read-only styling, never a
// control.
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-12' : 'col-sm-6'}>
      <div className="form-label mb-1">{label}</div>
      <div className="form-control tk-field--readonly tk-staff-detail__value">{children}</div>
    </div>
  )
}

const Unassigned = () => <span className="tk-queue__unassigned">Unassigned</span>

type Control = 'owner' | 'priority' | 'status'

// What the last save of a control came to (ui-spec.md §9.2).
type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'conflict' }
  | { kind: 'failure' }
  // A refusal the API explains in its own, displayable words.
  | { kind: 'refused'; message: string }

function ControlFeedback({ feedback }: { feedback: Feedback | undefined }) {
  if (!feedback) return null
  if (feedback.kind === 'success') return <SuccessNotice>{feedback.message}</SuccessNotice>
  if (feedback.kind === 'conflict') return <ConflictNotice />

  return (
    <InlineAlert variant="error">{feedback.kind === 'refused' ? feedback.message : SAFE_FAILURE_MESSAGE}</InlineAlert>
  )
}

function Busy({ when }: { when: boolean }) {
  return when ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null
}

// BR-29, in the words of POST /api/staff/tickets/:id/status (api-spec.md
// §5.6): trimmed, 10 to 2000 characters.
const SUMMARY_MIN_LENGTH = 10
const SUMMARY_MAX_LENGTH = 2000

function validateSummary(summary: string): string | null {
  if (summary === '') return 'A resolution summary is required.'
  if (summary.length < SUMMARY_MIN_LENGTH) {
    return `A resolution summary must be at least ${SUMMARY_MIN_LENGTH} characters.`
  }
  if (summary.length > SUMMARY_MAX_LENGTH) {
    return `A resolution summary must be at most ${SUMMARY_MAX_LENGTH} characters.`
  }
  return null
}

// How an attempt to resolve ended, as the dialog needs to know it.
type ResolveOutcome = { kind: 'closed' } | { kind: 'invalid'; message: string } | { kind: 'failure' }

// The Resolved dialog (ui-spec.md §9.2): a required Resolution Summary and
// "Mark as Resolved". A Ticket with no owner cannot be resolved (BR-29), so
// the dialog says so instead and offers Claim. It stays open, with what was
// typed, on anything but a saved or a conflicting request.
function ResolveDialog({
  ticket,
  claiming,
  onClaim,
  onResolve,
  onCancel,
}: {
  ticket: StaffTicket
  claiming: boolean
  onClaim: () => void
  onResolve: (resolutionSummary: string) => Promise<ResolveOutcome>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // What is validated, counted, and sent is the trimmed content.
  const summary = text.trim()
  const busy = saving || claiming
  const hasOwner = ticket.owner !== null

  // Claim leaves the dialog as the Ticket gets its owner, and would take
  // the focus with it: the summary takes it, so it stays inside the dialog
  // (ui-spec.md §12). It moves as the summary appears, so no moment leaves it
  // on the page.
  useLayoutEffect(() => {
    if (hasOwner) textareaRef.current?.focus()
  }, [hasOwner])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return

    setFailed(false)
    const invalid = validateSummary(summary)
    setFieldError(invalid)
    if (invalid) return

    setSaving(true)
    const outcome = await onResolve(summary)
    // Closed: the dialog is gone, and so is its state.
    if (outcome.kind === 'closed') return
    setSaving(false)
    if (outcome.kind === 'invalid') setFieldError(outcome.message)
    else setFailed(true)
  }

  return (
    <Dialog title={`Resolve ${ticket.ticketNumber}`} onDismiss={busy ? undefined : onCancel}>
      {!hasOwner ? (
        <>
          <p>A ticket needs an owner before it can be resolved.</p>
          <div className="tk-dialog__actions">
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} aria-busy={claiming} onClick={onClaim}>
              <Busy when={claiming} />
              Claim
            </button>
          </div>
        </>
      ) : (
        <form noValidate onSubmit={handleSubmit}>
          {failed && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}
          <label htmlFor="resolution-summary" className="form-label tk-required">
            Resolution Summary
          </label>
          <textarea
            ref={textareaRef}
            id="resolution-summary"
            className={`form-control ${fieldError ? 'is-invalid' : ''}`}
            rows={5}
            value={text}
            readOnly={saving}
            aria-required="true"
            aria-invalid={fieldError !== null}
            aria-describedby="resolution-summary-caption resolution-summary-count resolution-summary-error"
            onChange={(event) => {
              setText(event.target.value)
              setFieldError(null)
            }}
          />
          <div className="d-flex justify-content-between gap-3 mt-1">
            <div id="resolution-summary-error" className="invalid-feedback d-block">
              {fieldError}
            </div>
            <div id="resolution-summary-count" className="tk-comments__count text-muted small">
              {summary.length} / {SUMMARY_MAX_LENGTH}
            </div>
          </div>
          <div id="resolution-summary-caption" className="form-text">
            Visible to the Requester
          </div>
          <div className="tk-dialog__actions">
            <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              <Busy when={saving} />
              Mark as Resolved
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

// The Operations card (ui-spec.md §9.2): the only editable part of the
// screen. Each control saves on its own and reports its own busy, success,
// and failure state. A finished Ticket shows the same values read-only.
function Operations({
  ticket,
  owners,
  user,
  onSaved,
  onConflict,
}: {
  ticket: StaffTicket
  owners: EligibleOwner[]
  user: UserIdentity
  onSaved: (ticket: StaffTicket) => void
  // The Ticket is no longer as this screen last loaded it: load it again.
  onConflict: () => void
}) {
  const finishedAs = FINISHED_AS[ticket.currentStatus]
  const [ownerChoice, setOwnerChoice] = useState<string | null>(null)
  const [priorityChoice, setPriorityChoice] = useState<Priority | null>(null)
  const [statusChoice, setStatusChoice] = useState<TicketStatus | ''>('')
  // The button whose request is in flight, per control.
  const [saving, setSaving] = useState<Partial<Record<Control, string>>>({})
  const [feedback, setFeedback] = useState<Partial<Record<Control, Feedback>>>({})
  // The dialog that is open: a confirmation, or the Resolved dialog.
  const [confirming, setConfirming] = useState<'owner' | 'status' | 'resolve' | null>(null)

  // Each select follows the Ticket until the user picks something else.
  const currentOwner = ticket.owner ? String(ticket.owner.id) : ''
  const selectedOwner = ownerChoice ?? currentOwner
  const selectedPriority = priorityChoice ?? ticket.itPriority
  // Lab 4 ui-spec.md §9: the Resolution Gate, shown from the counts. The
  // backend enforces it regardless.
  const { done, planned } = ticket.actionTakenCounts
  const resolvedUnavailable = ticket.allowedTransitions.includes('RESOLVED') && (done === 0 || planned > 0)
  // A status the Ticket can no longer be moved to is not a choice.
  const selectedStatus =
    statusChoice !== '' &&
    ticket.allowedTransitions.includes(statusChoice) &&
    !(statusChoice === 'RESOLVED' && resolvedUnavailable)
      ? statusChoice
      : ''
  // The current owner is listed even when they are no longer eligible.
  const ownerOptions =
    ticket.owner && !owners.some((owner) => owner.id === ticket.owner!.id) ? [ticket.owner, ...owners] : owners
  const ownerName = (value: string) => ownerOptions.find((owner) => String(owner.id) === value)?.name ?? ''

  // Sends one control's change. True when it was saved.
  const save = async (
    control: Control,
    button: string,
    request: () => Promise<StaffTicket>,
    saved: (updated: StaffTicket) => string,
  ): Promise<boolean> => {
    setSaving((prev) => ({ ...prev, [control]: button }))
    // A notice is about the last save, whichever control made it.
    setFeedback({})
    let result: Feedback
    try {
      const updated = await request()
      onSaved(updated)
      result = { kind: 'success', message: saved(updated) }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        result = { kind: 'conflict' }
        onConflict()
      } else if (err instanceof ApiError && err.status === 400) {
        result = { kind: 'refused', message: err.message }
      } else {
        result = { kind: 'failure' }
      }
    }
    setSaving((prev) => ({ ...prev, [control]: undefined }))
    setFeedback((prev) => ({ ...prev, [control]: result }))

    return result.kind === 'success'
  }

  // BR-24: giving an owner to a New Ticket opens it, and the notice says so.
  const ownerSaved = (updated: StaffTicket) =>
    ticket.currentStatus === 'NEW' && updated.currentStatus === 'OPEN'
      ? 'Owner updated. Status changed to Open.'
      : 'Owner updated.'

  const sendOwner = async (button: string, ownerId: number | null): Promise<boolean> => {
    const saved = await save(
      'owner',
      button,
      // `expectedOwnerId` is the owner this screen shows (BR-23).
      () => updateTicketOwner(ticket.id, ownerId, ticket.owner?.id ?? null),
      ownerSaved,
    )
    if (saved) setOwnerChoice(null)

    return saved
  }

  const claim = () => sendOwner('claim', user.id)
  const updateOwner = () => sendOwner('update', selectedOwner === '' ? null : Number(selectedOwner))

  const pressUpdateOwner = () => {
    // BR-23: taking a Ticket from an owner other than oneself needs a
    // confirmation.
    if (ticket.owner && ticket.owner.id !== user.id) {
      setConfirming('owner')
    } else {
      void updateOwner()
    }
  }

  const updatePriority = async () => {
    const saved = await save(
      'priority',
      'update',
      () => updateItPriority(ticket.id, selectedPriority),
      () => 'IT Priority updated.',
    )
    if (saved) setPriorityChoice(null)
  }

  const statusRequest = (resolutionSummary?: string) => ({
    status: selectedStatus as TicketStatus,
    // BR-30: the status this screen shows.
    expectedStatus: ticket.currentStatus,
    ...(resolutionSummary !== undefined && { resolutionSummary }),
  })
  const statusSaved = (updated: StaffTicket) => `Status changed to ${statusLabel(updated.currentStatus)}.`

  const updateStatus = async () => {
    const saved = await save('status', 'update', () => updateTicketStatus(ticket.id, statusRequest()), statusSaved)
    if (saved) setStatusChoice('')
  }

  const pressUpdateStatus = () => {
    // BR-30: Resolved, Closed, and Cancelled need a confirmation step.
    if (selectedStatus === 'RESOLVED') {
      setConfirming('resolve')
    } else if (selectedStatus === 'CLOSED' || selectedStatus === 'CANCELLED') {
      setConfirming('status')
    } else {
      void updateStatus()
    }
  }

  // From the Resolved dialog, which shows a refused summary and a failure
  // itself, with what was typed.
  const resolve = async (resolutionSummary: string): Promise<ResolveOutcome> => {
    setFeedback({})
    try {
      const updated = await updateTicketStatus(ticket.id, statusRequest(resolutionSummary))
      onSaved(updated)
      setStatusChoice('')
      setFeedback((prev) => ({ ...prev, status: { kind: 'success', message: statusSaved(updated) } }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.field === 'resolutionSummary') {
        return { kind: 'invalid', message: err.message }
      }
      if (!(err instanceof ApiError && err.status === 409)) {
        return { kind: 'failure' }
      }
      setFeedback((prev) => ({ ...prev, status: { kind: 'conflict' } }))
      onConflict()
    }
    setConfirming(null)

    return { kind: 'closed' }
  }

  return (
    <section className="tk-ops card h-100" aria-labelledby="operations-title">
      <div className="card-body">
        <h2 id="operations-title" className="h5 mb-3">
          Manage this ticket
        </h2>

        {finishedAs ? (
          <>
            {/* What a control was told as the Ticket was finished. */}
            <ControlFeedback feedback={feedback.owner} />
            <ControlFeedback feedback={feedback.priority} />
            <ControlFeedback feedback={feedback.status} />
            <p className="tk-comments__finished">This ticket is {finishedAs} and can no longer be changed.</p>
            <dl className="tk-ops__values mb-0">
              <dt>Ticket Owner</dt>
              <dd>{ticket.owner?.name ?? <Unassigned />}</dd>
              <dt>IT Priority</dt>
              <dd>
                <PriorityBadge priority={ticket.itPriority} />
              </dd>
              <dt>Current Status</dt>
              <dd>
                <StatusBadge status={ticket.currentStatus} />
              </dd>
            </dl>
          </>
        ) : (
          <div className="tk-ops__controls">
            <div className="tk-ops__control">
              <label htmlFor="ticket-owner" className="form-label">
                Ticket Owner
              </label>
              <p className="tk-ops__current">
                <span>Current owner:</span> {ticket.owner?.name ?? <Unassigned />}
              </p>
              <ControlFeedback feedback={feedback.owner} />
              {!ticket.owner && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving.owner !== undefined}
                  aria-busy={saving.owner === 'claim'}
                  onClick={claim}
                >
                  <Busy when={saving.owner === 'claim'} />
                  Claim
                </button>
              )}
              <select
                id="ticket-owner"
                className="form-select"
                value={selectedOwner}
                disabled={saving.owner !== undefined}
                onChange={(event) => setOwnerChoice(event.target.value)}
              >
                <option value="">Unassigned</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={selectedOwner === currentOwner || saving.owner !== undefined}
                aria-busy={saving.owner === 'update'}
                onClick={pressUpdateOwner}
              >
                <Busy when={saving.owner === 'update'} />
                Update Owner
              </button>
            </div>

            <div className="tk-ops__control">
              <label htmlFor="ticket-it-priority" className="form-label">
                IT Priority
              </label>
              <p className="tk-ops__current">
                <span>Requested Priority:</span> <PriorityBadge priority={ticket.requestedPriority} />
              </p>
              <ControlFeedback feedback={feedback.priority} />
              <select
                id="ticket-it-priority"
                className="form-select"
                value={selectedPriority}
                disabled={saving.priority !== undefined}
                onChange={(event) => setPriorityChoice(event.target.value as Priority)}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={selectedPriority === ticket.itPriority || saving.priority !== undefined}
                aria-busy={saving.priority !== undefined}
                onClick={updatePriority}
              >
                <Busy when={saving.priority !== undefined} />
                Update Priority
              </button>
            </div>

            <div className="tk-ops__control">
              <label htmlFor="ticket-status" className="form-label">
                Current Status
              </label>
              <p className="tk-ops__current">
                <span>Now:</span> <StatusBadge status={ticket.currentStatus} />
              </p>
              <ControlFeedback feedback={feedback.status} />
              <select
                id="ticket-status"
                className="form-select"
                value={selectedStatus}
                disabled={saving.status !== undefined}
                aria-describedby={resolvedUnavailable ? 'ticket-status-reason' : undefined}
                onChange={(event) => setStatusChoice(event.target.value as TicketStatus | '')}
              >
                <option value="">Choose a new status…</option>
                {ticket.allowedTransitions.map((status) => {
                  const unavailable = status === 'RESOLVED' && resolvedUnavailable

                  return (
                    <option key={status} value={status} disabled={unavailable}>
                      {unavailable ? 'Resolved (not available)' : statusLabel(status)}
                    </option>
                  )
                })}
              </select>
              {resolvedUnavailable && (
                <p className="form-text mb-0">
                  <span id="ticket-status-reason">
                    Resolved needs at least one Done action and no Planned actions. Done: {done}. Planned: {planned}.
                  </span>{' '}
                  <a
                    href={`#${ACTIONS_TAKEN_ID}`}
                    onClick={(event) => {
                      event.preventDefault()
                      document.getElementById(ACTIONS_TAKEN_ID)?.focus()
                    }}
                  >
                    Go to Actions Taken
                  </a>
                </p>
              )}
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={selectedStatus === '' || saving.status !== undefined}
                aria-busy={saving.status !== undefined}
                onClick={pressUpdateStatus}
              >
                <Busy when={saving.status !== undefined} />
                Update Status
              </button>
            </div>
          </div>
        )}
      </div>

      {confirming === 'owner' && ticket.owner && (
        <ConfirmDialog
          title={selectedOwner === '' ? 'Return ticket to the queue?' : 'Reassign ticket?'}
          confirmLabel={selectedOwner === '' ? 'Return to Queue' : 'Reassign'}
          busy={saving.owner !== undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await updateOwner()
            setConfirming(null)
          }}
        >
          {ticket.ticketNumber} is owned by {ticket.owner.name}.{' '}
          {selectedOwner === '' ? 'Return it to the queue as unassigned?' : `Reassign it to ${ownerName(selectedOwner)}?`}
        </ConfirmDialog>
      )}

      {confirming === 'status' && (selectedStatus === 'CLOSED' || selectedStatus === 'CANCELLED') && (
        <ConfirmDialog
          title={selectedStatus === 'CLOSED' ? 'Close ticket?' : 'Cancel ticket?'}
          confirmLabel={selectedStatus === 'CLOSED' ? 'Close Ticket' : 'Cancel Ticket'}
          destructive={selectedStatus === 'CANCELLED'}
          busy={saving.status !== undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await updateStatus()
            setConfirming(null)
          }}
        >
          {selectedStatus === 'CLOSED'
            ? `Close ${ticket.ticketNumber}? A closed ticket cannot be reopened or changed.`
            : `Cancel ${ticket.ticketNumber}? A cancelled ticket cannot be changed.`}
        </ConfirmDialog>
      )}

      {confirming === 'resolve' && selectedStatus === 'RESOLVED' && (
        <ResolveDialog
          ticket={ticket}
          claiming={saving.owner === 'claim'}
          onClaim={async () => {
            // A claim that did not go through is explained in the card.
            if (!(await claim())) setConfirming(null)
          }}
          onResolve={resolve}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  )
}

// The Attachments tab (ui-spec.md §9.5): the Lab 2 list, read-only. Staff
// download an active Attachment and have no Add or Remove control.
function Attachments({ attachments }: { attachments: StaffTicket['attachments'] }) {
  const [failed, setFailed] = useState(false)
  const active = attachments.filter((attachment) => attachment.removedAt === null)
  const removed = attachments.filter((attachment) => attachment.removedAt !== null)

  const download = async (attachment: StaffTicket['attachments'][number]) => {
    setFailed(false)
    try {
      await downloadAttachment(attachment.id, attachment.originalFilename)
    } catch {
      setFailed(true)
    }
  }

  if (attachments.length === 0) {
    return <p className="text-muted mb-0">No attachments.</p>
  }

  return (
    <>
      {failed && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}

      {active.length > 0 && (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-3">
          {active.map((attachment) => (
            <li key={attachment.id} className="d-flex align-items-center gap-2 p-2 rounded border border-secondary-subtle">
              <span className="flex-grow-1 text-truncate" title={attachment.originalFilename}>
                {attachment.originalFilename}
              </span>
              <span className="text-muted small text-nowrap">{formatSize(attachment.sizeBytes)}</span>
              <button
                type="button"
                className="tk-staff-detail__download btn btn-sm btn-outline-primary"
                aria-label={`Download ${attachment.originalFilename}`}
                onClick={() => download(attachment)}
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <>
          <h3 className="h6 text-muted mb-2">Removed</h3>
          <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
            {removed.map((attachment) => (
              <li
                key={attachment.id}
                className="d-flex flex-column gap-1 p-2 rounded border border-secondary-subtle text-muted"
              >
                <span className="text-decoration-line-through text-truncate" title={attachment.originalFilename}>
                  {attachment.originalFilename}
                </span>
                <span className="small tk-staff-detail__wrap">
                  {formatSize(attachment.sizeBytes)} · removed {attachment.removedAt && formatDate(attachment.removedAt)}
                  {attachment.removalReason ? ` · ${attachment.removalReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

type TabKey = 'comments' | 'notes' | 'attachments'
const TAB_KEYS: TabKey[] = ['comments', 'notes', 'attachments']

// The tabs of ui-spec.md §9.1: Public Comments, Internal Notes, and
// Attachments. Every panel stays mounted and only the selected one is
// shown, so the two composers are never visible at once and text typed in
// one survives a visit to another (§9.4).
function Tabs({ labels, children }: { labels: Record<TabKey, ReactNode>; children: Record<TabKey, ReactNode> }) {
  const id = useId()
  const [selected, setSelected] = useState<TabKey>('comments')

  // The tab pattern (ui-spec.md §12): arrow keys move between tabs.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TAB_KEYS.indexOf(selected)
    const next = {
      ArrowRight: TAB_KEYS[(index + 1) % TAB_KEYS.length],
      ArrowLeft: TAB_KEYS[(index + TAB_KEYS.length - 1) % TAB_KEYS.length],
      Home: TAB_KEYS[0],
      End: TAB_KEYS[TAB_KEYS.length - 1],
    }[event.key]
    if (!next) return

    event.preventDefault()
    setSelected(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }

  return (
    <div className="tk-tabs card">
      <div className="tk-tabs__list" role="tablist" aria-label="Ticket activity" onKeyDown={handleKeyDown}>
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-tab-${key}`}
            className="tk-tabs__tab"
            aria-selected={selected === key}
            aria-controls={`${id}-panel-${key}`}
            tabIndex={selected === key ? 0 : -1}
            onClick={() => setSelected(key)}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      {TAB_KEYS.map((key) => (
        <div
          key={key}
          role="tabpanel"
          id={`${id}-panel-${key}`}
          className={`tk-tabs__panel tk-tabs__panel--${key}`}
          aria-labelledby={`${id}-tab-${key}`}
          hidden={selected !== key}
        >
          {children[key]}
        </div>
      ))}
    </div>
  )
}

// IT Staff Ticket Detail (docs/lab-03/ui-spec.md §9), for IT Staff and
// Administrators alike: the Ticket's information read-only, the Operations
// card, the Resolution Summary, and the Public Comments, Internal Notes,
// and Attachments tabs. Mount it with the Ticket id as its `key`.
function StaffTicketDetail({ ticketId, user }: { ticketId: number; user: UserIdentity }) {
  const navigate = useNavigate()
  const queuePath = queuePathFrom(useLocation().state)
  const [detail, setDetail] = useState<Detail>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [owners, setOwners] = useState<EligibleOwner[]>([])
  // What each thread holds once it has loaded; until then, the Ticket's
  // own counts.
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [noteCount, setNoteCount] = useState<number | null>(null)

  useEffect(() => {
    // Without them the Owner select offers only "Unassigned" and the
    // current owner; the Ticket itself still loads.
    fetchEligibleOwners()
      .then(setOwners)
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    fetchStaffTicket(ticketId)
      .then((ticket): Detail => ({ status: 'loaded', ticket }))
      .catch((err): Detail => {
        if (err instanceof ApiError && err.status === 404) return { status: 'not-found' }
        if (err instanceof ApiError && err.code === 'FORBIDDEN') return { status: 'forbidden' }
        return { status: 'failed' }
      })
      .then((outcome) => {
        if (!cancelled) setDetail(outcome)
      })

    return () => {
      cancelled = true
    }
  }, [ticketId, attempt])

  const retry = () => {
    setDetail({ status: 'loading' })
    setAttempt((count) => count + 1)
  }

  // After a Conflict: the latest Ticket, in place, so the controls and
  // composers keep what was chosen and typed (ui-spec.md §2.3).
  const reloadTicket = () => {
    fetchStaffTicket(ticketId)
      .then((ticket) => setDetail((prev) => (prev.status === 'loaded' ? { status: 'loaded', ticket } : prev)))
      .catch(() => {
        // The Ticket shown stays as it was; the notice has been given.
      })
  }

  if (detail.status === 'not-found') return <StaffTicketNotFound user={user} />
  if (detail.status === 'forbidden') return <ForbiddenPage role={user.role} />

  const ticket = detail.status === 'loaded' ? detail.ticket : null
  const finishedAs = ticket ? FINISHED_AS[ticket.currentStatus] : undefined
  const activeAttachments = ticket ? ticket.attachments.filter((attachment) => attachment.removedAt === null).length : 0

  return (
    <div className="tk-staff-detail container py-4">
      <div className="tk-staff-detail__top">
        <nav aria-label="Breadcrumb">
          <ol className="tk-breadcrumb">
            <li>
              <Link to={queuePath}>{QUEUE.label}</Link>
            </li>
            {ticket && <li aria-current="page">{ticket.ticketNumber}</li>}
          </ol>
        </nav>
        {ticket && (
          <div className="tk-staff-detail__badges" role="group" aria-label="Ticket status">
            <StatusBadge status={ticket.currentStatus} />
            {ticket.requesterResolvedAt && (
              <>
                <AppearsResolvedBadge />
                <span className="text-muted small">on {formatDate(ticket.requesterResolvedAt)}</span>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className="tk-staff-detail__back btn btn-outline-primary"
          onClick={() => navigate(queuePath)}
        >
          Back to Queue
        </button>
      </div>

      {detail.status === 'loading' && (
        <div role="status">
          <span className="visually-hidden">Loading ticket…</span>
          {[0, 1].map((card) => (
            <div key={card} className="card mb-3" aria-hidden="true">
              <div className="card-body">
                <div className="tk-skeleton" />
                <div className="tk-skeleton" />
                <div className="tk-skeleton" />
                <div className="tk-skeleton" />
              </div>
            </div>
          ))}
        </div>
      )}

      {detail.status === 'failed' && (
        <InlineAlert variant="error">
          {SAFE_FAILURE_MESSAGE}{' '}
          <button type="button" className="btn btn-link p-0 align-baseline" onClick={retry}>
            Retry
          </button>
        </InlineAlert>
      )}

      {ticket && (
        <>
          <h1 className="h3 mb-3">{ticket.ticketNumber}</h1>

          <div className="row g-3 mb-3">
            <div className="col-lg-8">
              <section className="card h-100" aria-labelledby="ticket-information-title">
                <div className="card-body">
                  <h2 id="ticket-information-title" className="h5 mb-3">
                    Ticket information
                  </h2>
                  <div className="row g-3">
                    <Field label="Ticket Number">{ticket.ticketNumber}</Field>
                    <Field label="Created">{formatDateTime(ticket.createdAt)}</Field>
                    <Field label="Last Updated">{formatDateTime(ticket.updatedAt)}</Field>
                    <Field label="Requester">
                      <span>{ticket.requester.name}</span>{' '}
                      {!ticket.requester.isActive && <AccountBadge isActive={false} />}
                      <span className="d-block text-muted small">{ticket.requester.email}</span>
                    </Field>
                    <Field label="Category">{ticket.category.name}</Field>
                    <Field label="Related System">{ticket.relatedSystem.name}</Field>
                    <Field label="Requested Priority">
                      <PriorityBadge priority={ticket.requestedPriority} />
                    </Field>
                    <Field label="Summary" wide>
                      {ticket.summary}
                    </Field>
                    <Field label="Description" wide>
                      <span className="tk-staff-detail__description">{ticket.description}</span>
                    </Field>
                  </div>
                </div>
              </section>
            </div>
            <div className="col-lg-4">
              <Operations
                ticket={ticket}
                owners={owners}
                user={user}
                onSaved={(saved) => setDetail({ status: 'loaded', ticket: saved })}
                onConflict={reloadTicket}
              />
            </div>
          </div>

          {ticket.resolutionSummary !== null && (
            <section className="tk-resolution mb-3" aria-labelledby="resolution-summary-title">
              <h2 id="resolution-summary-title" className="tk-resolution__title">
                Resolution Summary
              </h2>
              <p className="tk-resolution__text">{ticket.resolutionSummary}</p>
              {ticket.resolvedAt && <p className="small mb-0">Resolved on {formatDate(ticket.resolvedAt)}</p>}
            </section>
          )}

          <Tabs
            labels={{
              comments: `Public Comments (${commentCount ?? ticket.publicCommentCount})`,
              notes: (
                <>
                  <span aria-hidden="true">🔒 </span>
                  Internal Notes ({noteCount ?? ticket.internalNoteCount})
                </>
              ),
              attachments: `Attachments (${activeAttachments})`,
            }}
          >
            {{
              comments: (
                <EntryThread
                  kind="comment"
                  ticketId={ticket.id}
                  header={() => (
                    <p className="tk-thread__strip tk-thread__strip--info">Visible to the Requester and IT Staff.</p>
                  )}
                  submitLabel="Post Public Comment"
                  submitClassName="btn-primary"
                  finished={finishedAs && `This ticket is ${finishedAs}. Create a new ticket if you need more help.`}
                  onConflict={reloadTicket}
                  onCount={setCommentCount}
                  // A new Public Comment moves the Ticket's last-updated
                  // time to its own (specification.md §7.1).
                  onPosted={(comment) =>
                    setDetail((prev) =>
                      prev.status === 'loaded'
                        ? { status: 'loaded', ticket: { ...prev.ticket, updatedAt: comment.createdAt } }
                        : prev,
                    )
                  }
                />
              ),
              notes: (
                <EntryThread
                  kind="note"
                  ticketId={ticket.id}
                  header={() => (
                    <p className="tk-thread__strip tk-thread__strip--internal">
                      <span aria-hidden="true">🔒 </span>
                      Internal — never shown to the Requester.
                    </p>
                  )}
                  submitLabel="Add Internal Note"
                  submitClassName="btn-outline-primary"
                  finished={finishedAs && `This ticket is ${finishedAs} and can no longer be changed.`}
                  onConflict={reloadTicket}
                  onCount={setNoteCount}
                />
              ),
              attachments: <Attachments attachments={ticket.attachments} />,
            }}
          </Tabs>
        </>
      )}
    </div>
  )
}

export default StaffTicketDetail
