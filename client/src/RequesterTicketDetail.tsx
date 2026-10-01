import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  ApiError,
  downloadAttachment,
  fetchCategories,
  fetchRelatedSystems,
  fetchTicketById,
  removeAttachment,
  setResolutionIndication,
  uploadAttachment,
  withdrawResolutionIndication,
  type Category,
  type RelatedSystem,
  type TicketAttachment,
  type TicketDetail,
} from './api'
import { MAX_ACTIVE_ATTACHMENTS, validateAttachmentFile } from './attachmentRules'
import { useSession } from './useSession'
import { PriorityBadge, StatusBadge } from './badges'
import { ConflictNotice, InlineAlert, SAFE_FAILURE_MESSAGE, SuccessNotice } from './feedback'
import PublicComments from './PublicComments'

// A Closed or Cancelled Ticket is finished, and read-only (BR-31).
const FINISHED_AS: Record<string, 'closed' | 'cancelled'> = { CLOSED: 'closed', CANCELLED: 'cancelled' }

function isFinished(status: string): boolean {
  return status in FINISHED_AS
}

// A 409: the Ticket is no longer as this screen last loaded it.
function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409
}

type DetailState =
  | { status: 'loading' }
  | { status: 'success'; ticket: TicketDetail }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="col-md-6 col-lg-4">
      <div className="form-label mb-1">{label}</div>
      <div className="form-control bg-body-tertiary" style={{ pointerEvents: 'none' }} aria-readonly="true">
        {value}
      </div>
    </div>
  )
}

// Attachments section (ui-spec.md §9/§3, ticket #22): active attachments
// (download + remove), a removed sub-list (muted, metadata only), and an
// "Add Attachment" control reusing the same upload endpoint/limits as
// Create Ticket (#19).
function AttachmentsSection({
  ticketId,
  attachments,
  readOnly,
  onAdded,
  onRemoved,
  onConflict,
}: {
  ticketId: number
  attachments: TicketAttachment[]
  // A finished Ticket (docs/lab-03/ui-spec.md §7.4): Add Attachment and
  // each Remove action are not rendered; Download remains.
  readOnly: boolean
  onAdded: (attachment: TicketAttachment) => void
  onRemoved: (attachment: TicketAttachment) => void
  // The Ticket was finished meanwhile: load it again.
  onConflict: () => void
}) {
  const [pickError, setPickError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadErrors, setDownloadErrors] = useState<Record<number, string>>({})
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [removalReason, setRemovalReason] = useState('')
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [conflict, setConflict] = useState(false)

  const active = attachments.filter((a) => a.removedAt === null)
  const removed = attachments.filter((a) => a.removedAt !== null)

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file later

    if (!file) return

    const fileError = validateAttachmentFile(file)
    if (fileError) {
      setPickError(fileError)
      return
    }
    if (active.length >= MAX_ACTIVE_ATTACHMENTS) {
      setPickError(`You can attach up to ${MAX_ACTIVE_ATTACHMENTS} files per Ticket.`)
      return
    }

    setPickError(null)
    setConflict(false)
    setUploading(true)
    try {
      const attachment = await uploadAttachment(ticketId, file)
      onAdded({ ...attachment, removedAt: null, removedByRequesterId: null, removalReason: null })
    } catch (err) {
      if (isConflict(err)) {
        setConflict(true)
        onConflict()
      } else {
        setPickError(err instanceof Error ? err.message : 'Unable to upload attachment')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (attachment: TicketAttachment) => {
    setDownloadErrors((prev) => {
      const next = { ...prev }
      delete next[attachment.id]
      return next
    })
    try {
      await downloadAttachment(attachment.id, attachment.originalFilename)
    } catch (err) {
      setDownloadErrors((prev) => ({
        ...prev,
        [attachment.id]: err instanceof Error ? err.message : 'Unable to download attachment',
      }))
    }
  }

  const openRemoveConfirm = (attachmentId: number) => {
    setRemovingId(attachmentId)
    setRemovalReason('')
    setRemovalError(null)
  }

  const cancelRemoveConfirm = () => {
    setRemovingId(null)
    setRemovalReason('')
    setRemovalError(null)
  }

  const confirmRemove = async () => {
    if (removingId === null) return

    // BR-19 mirrored client-side; the server independently re-validates.
    const reason = removalReason.trim()
    if (reason.length < 5 || reason.length > 500) {
      setRemovalError('A removal reason (5-500 characters) is required.')
      return
    }

    setRemoving(true)
    setRemovalError(null)
    setConflict(false)
    try {
      const updated = await removeAttachment(removingId, reason)
      onRemoved(updated)
      setRemovingId(null)
      setRemovalReason('')
    } catch (err) {
      if (isConflict(err)) {
        setConflict(true)
        onConflict()
      } else {
        setRemovalError(err instanceof Error ? err.message : 'Unable to remove attachment')
      }
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="mb-4 border-top pt-4">
      <h2 className="h5 mb-3">Attachments</h2>

      {conflict && <ConflictNotice />}

      {active.length === 0 && <p className="text-muted small mb-3">No active attachments.</p>}

      {active.length > 0 && (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-3">
          {active.map((attachment) => (
            <li key={attachment.id} className="d-flex align-items-center gap-2 p-2 rounded border border-secondary-subtle">
              <span className="flex-grow-1 text-truncate" title={attachment.originalFilename}>
                {attachment.originalFilename}
              </span>
              <span className="text-muted small">{formatSize(attachment.sizeBytes)}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                aria-label={`Download ${attachment.originalFilename}`}
                title="Download"
                onClick={() => handleDownload(attachment)}
              >
                ⬇
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  aria-label={`Remove ${attachment.originalFilename}`}
                  title="Remove"
                  onClick={() => openRemoveConfirm(attachment.id)}
                >
                  ✕
                </button>
              )}
              {downloadErrors[attachment.id] && (
                <div className="text-danger small w-100" role="alert">
                  {downloadErrors[attachment.id]}
                </div>
              )}
              {!readOnly && removingId === attachment.id && (
                <div className="w-100 mt-2 p-2 border rounded border-danger-subtle">
                  <label htmlFor={`removal-reason-${attachment.id}`} className="form-label small mb-1">
                    Reason for removal <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id={`removal-reason-${attachment.id}`}
                    className="form-control form-control-sm mb-2"
                    value={removalReason}
                    onChange={(e) => setRemovalReason(e.target.value)}
                    disabled={removing}
                  />
                  {removalError && (
                    <div className="text-danger small mb-2" role="alert">
                      {removalError}
                    </div>
                  )}
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={confirmRemove}
                      disabled={removing}
                    >
                      {removing ? 'Removing…' : 'Confirm Remove'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={cancelRemoveConfirm}
                      disabled={removing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mb-3">
          <label htmlFor="add-attachment" className="form-label">
            Add Attachment
          </label>
          <input
            id="add-attachment"
            type="file"
            className="form-control"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelected}
            disabled={uploading || active.length >= MAX_ACTIVE_ATTACHMENTS}
          />
          <div className="form-text">JPG, PNG, WEBP, or PDF — up to 5 MB each, up to 5 active files.</div>
          {uploading && (
            <p role="status" className="text-muted small mt-1">
              Uploading…
            </p>
          )}
          {pickError && (
            <div className="text-danger small mt-1" role="alert">
              {pickError}
            </div>
          )}
        </div>
      )}

      {removed.length > 0 && (
        <div>
          <h3 className="h6 text-muted mb-2">Removed</h3>
          <ul className="list-unstyled d-flex flex-column gap-2">
            {removed.map((attachment) => (
              <li
                key={attachment.id}
                className="d-flex flex-column gap-1 p-2 rounded border border-secondary-subtle text-muted"
              >
                <span className="text-decoration-line-through text-truncate" title={attachment.originalFilename}>
                  {attachment.originalFilename}
                </span>
                <span className="small">
                  {formatSize(attachment.sizeBytes)} · removed {attachment.removedAt && formatDate(attachment.removedAt)}
                  {attachment.removalReason ? ` · ${attachment.removalReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Problem Appears Resolved (docs/lab-03/ui-spec.md §7.2, BR-33): the
// Requester's flag that the problem seems fixed. It never changes the
// Current Status, and is not offered once the Ticket is Resolved or
// finished.
function ProblemAppearsResolved({
  ticket,
  onChanged,
  onConflict,
}: {
  ticket: TicketDetail
  onChanged: (requesterResolvedAt: string | null) => void
  // The Ticket was resolved or finished meanwhile: load it again.
  onConflict: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<
    { kind: 'success'; message: string } | { kind: 'conflict' } | { kind: 'failure' } | null
  >(null)

  const indicated = ticket.requesterResolvedAt !== null

  const change = async (indicate: boolean) => {
    setBusy(true)
    setFeedback(null)
    try {
      const { requesterResolvedAt } = await (indicate
        ? setResolutionIndication(ticket.id)
        : withdrawResolutionIndication(ticket.id))
      onChanged(requesterResolvedAt)
      setFeedback({
        kind: 'success',
        message: indicate ? 'IT has been told that the problem appears resolved.' : 'Indication withdrawn.',
      })
    } catch (err) {
      if (isConflict(err)) {
        setFeedback({ kind: 'conflict' })
        onConflict()
      } else {
        setFeedback({ kind: 'failure' })
      }
    } finally {
      setBusy(false)
    }
  }

  // A finished Ticket has no card. The notice that it was finished
  // meanwhile still has to be said.
  if (isFinished(ticket.currentStatus)) {
    return feedback?.kind === 'conflict' ? <ConflictNotice /> : null
  }

  return (
    <section
      className={`tk-resolved-card card mb-4 ${indicated ? 'tk-resolved-card--indicated' : ''}`}
      aria-label="Problem Appears Resolved"
    >
      <div className="card-body">
        {feedback?.kind === 'success' && <SuccessNotice>{feedback.message}</SuccessNotice>}
        {feedback?.kind === 'conflict' && <ConflictNotice />}
        {feedback?.kind === 'failure' && <InlineAlert variant="error">{SAFE_FAILURE_MESSAGE}</InlineAlert>}

        {ticket.currentStatus === 'RESOLVED' ? (
          <p className="tk-resolved-card__info mb-0">
            IT has marked this ticket resolved. If the problem has returned, say so in a comment below.
          </p>
        ) : indicated ? (
          <>
            <p className="mb-2">
              You told IT on {formatDate(ticket.requesterResolvedAt!)} that the problem appears resolved. IT Staff
              will review it.
            </p>
            <button
              type="button"
              className="btn btn-link"
              disabled={busy}
              aria-busy={busy}
              onClick={() => change(false)}
            >
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Withdraw
            </button>
          </>
        ) : (
          <>
            <p className="mb-2">Is the problem fixed? Let IT know. IT Staff decide when the ticket is resolved.</p>
            <button
              type="button"
              className="btn btn-outline-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => change(true)}
            >
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Problem Appears Resolved
            </button>
          </>
        )}
      </div>
    </section>
  )
}

// Requester Ticket Detail (docs/lab-02/ui-spec.md §9, continued in
// docs/lab-03/ui-spec.md §7): a read-only field grid, Summary and
// Description, and Attachment management, plus the Ticket Owner, the
// Resolution Summary, Problem Appears Resolved, and Public Comments. No
// Internal Notes, Actions Taken, or status change (BR-32).
function RequesterTicketDetail({ ticketId, onBack }: { ticketId: number; onBack: () => void }) {
  const { user } = useSession()
  const [categories, setCategories] = useState<Category[]>([])
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([])
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' })

  useEffect(() => {
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([cats, systems]) => {
        setCategories(cats)
        setRelatedSystems(systems)
      })
      .catch(() => {
        // Category/Related System names just fall back to "—"; the Ticket
        // itself still loads independently of this.
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setDetail({ status: 'loading' })

    fetchTicketById(ticketId)
      .then((ticket) => {
        if (!cancelled) setDetail({ status: 'success', ticket })
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to load ticket'
        // AC-03/ADR-0004: a missing-or-not-owned Ticket is a 404 whose
        // body is exactly { error: "Ticket not found" } — that's the
        // signal for the dedicated not-found state.
        setDetail(message === 'Ticket not found' ? { status: 'not-found' } : { status: 'error', message })
      })

    return () => {
      cancelled = true
    }
  }, [ticketId])

  // After a Conflict: the latest Ticket, in place, so the cards below keep
  // what was typed into them (ui-spec.md §2.3).
  const reloadTicket = () => {
    fetchTicketById(ticketId)
      .then((ticket) => setDetail((prev) => (prev.status === 'success' ? { status: 'success', ticket } : prev)))
      .catch(() => {
        // The Ticket shown stays as it was; the notice has been given.
      })
  }

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? '—'
  const relatedSystemName = (id: number) => relatedSystems.find((s) => s.id === id)?.name ?? '—'

  return (
    <div className="requester-ticket-detail container py-5" style={{ maxWidth: 900 }}>
      <button type="button" className="btn btn-link text-decoration-none ps-0 mb-3" onClick={onBack}>
        ← Back to My Tickets
      </button>

      {detail.status === 'loading' && <p role="status">⏳ Loading ticket…</p>}

      {detail.status === 'not-found' && (
        <div className="text-center py-5 border rounded">
          <h1 className="h4 mb-2">Ticket not found</h1>
          <p className="text-muted mb-3">
            This Ticket doesn't exist, or isn't one of {user?.name ?? 'yours'}'s Tickets.
          </p>
          <button type="button" className="btn btn-outline-primary" onClick={onBack}>
            Back to My Tickets
          </button>
        </div>
      )}

      {detail.status === 'error' && (
        <p className="text-danger" role="alert">
          {detail.message}
        </p>
      )}

      {detail.status === 'success' && (
        <>
          <h1 className="h3 mb-4">{detail.ticket.ticketNumber}</h1>

          <div className="row g-3 mb-4">
            <ReadOnlyField label="Ticket Number" value={detail.ticket.ticketNumber} />
            <ReadOnlyField label="Ticket Date" value={formatDate(detail.ticket.createdAt)} />
            <ReadOnlyField label="Requester" value={user?.name ?? '—'} />
            <ReadOnlyField label="Category" value={categoryName(detail.ticket.categoryId)} />
            <ReadOnlyField label="Related System" value={relatedSystemName(detail.ticket.relatedSystemId)} />
            <ReadOnlyField
              label="Requested Priority"
              value={<PriorityBadge priority={detail.ticket.requestedPriority} />}
            />
            <ReadOnlyField label="IT Priority" value={<PriorityBadge priority={detail.ticket.itPriority} />} />
            <ReadOnlyField label="Current Status" value={<StatusBadge status={detail.ticket.currentStatus} />} />
            <ReadOnlyField
              label="Ticket Owner"
              value={detail.ticket.ownerName ?? <span className="text-muted fst-italic">Unassigned</span>}
            />
          </div>

          <div className="mb-4">
            <div className="form-label mb-1">Summary</div>
            <div className="form-control bg-body-tertiary" style={{ pointerEvents: 'none' }} aria-readonly="true">
              {detail.ticket.summary}
            </div>
          </div>

          <div className="mb-4">
            <div className="form-label mb-1">Description</div>
            <div
              className="form-control bg-body-tertiary"
              style={{ pointerEvents: 'none', minHeight: 120, whiteSpace: 'pre-wrap' }}
              aria-readonly="true"
            >
              {detail.ticket.description}
            </div>
          </div>

          {detail.ticket.resolutionSummary !== null && (
            <section className="tk-resolution mb-4" aria-labelledby="resolution-summary-title">
              <h2 id="resolution-summary-title" className="tk-resolution__title">
                Resolution Summary
              </h2>
              <p className="tk-resolution__text">{detail.ticket.resolutionSummary}</p>
              {detail.ticket.resolvedAt && (
                <p className="small mb-0">Resolved on {formatDate(detail.ticket.resolvedAt)}</p>
              )}
            </section>
          )}

          <AttachmentsSection
            ticketId={detail.ticket.id}
            attachments={detail.ticket.attachments}
            readOnly={isFinished(detail.ticket.currentStatus)}
            onConflict={reloadTicket}
            onAdded={(attachment) => {
              setDetail((prev) =>
                prev.status === 'success'
                  ? { ...prev, ticket: { ...prev.ticket, attachments: [attachment, ...prev.ticket.attachments] } }
                  : prev,
              )
            }}
            onRemoved={(updated) => {
              setDetail((prev) =>
                prev.status === 'success'
                  ? {
                      ...prev,
                      ticket: {
                        ...prev.ticket,
                        attachments: prev.ticket.attachments.map((a) =>
                          a.id === updated.id ? { ...a, ...updated } : a,
                        ),
                      },
                    }
                  : prev,
              )
            }}
          />

          <ProblemAppearsResolved
            ticket={detail.ticket}
            onConflict={reloadTicket}
            onChanged={(requesterResolvedAt) => {
              setDetail((prev) =>
                prev.status === 'success' ? { ...prev, ticket: { ...prev.ticket, requesterResolvedAt } } : prev,
              )
            }}
          />

          <PublicComments
            key={detail.ticket.id}
            ticketId={detail.ticket.id}
            finishedAs={FINISHED_AS[detail.ticket.currentStatus] ?? null}
            onConflict={reloadTicket}
          />
        </>
      )}
    </div>
  )
}

export default RequesterTicketDetail
