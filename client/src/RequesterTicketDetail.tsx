import { useEffect, useState, type ReactNode } from 'react'
import { fetchCategories, fetchRelatedSystems, fetchTicketById, type Category, type RelatedSystem, type TicketDetail } from './api'
import { useRequester } from './useRequester'
import { PriorityBadge, StatusBadge } from './badges'

type DetailState =
  | { status: 'loading' }
  | { status: 'success'; ticket: TicketDetail }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="col-sm-6 col-lg-4">
      <div className="form-label mb-1">{label}</div>
      <div className="form-control bg-body-tertiary" style={{ pointerEvents: 'none' }} aria-readonly="true">
        {value}
      </div>
    </div>
  )
}

// Requester Ticket Detail, view mode (ui-spec.md §9, ticket #21): a
// read-only field grid + Summary/Description. No Attachments section yet
// (#22), and no Public Comments / Internal Notes / Actions Taken / status
// change — those are permanently out of scope for Lab 2.
function RequesterTicketDetail({ ticketId, onBack }: { ticketId: number; onBack: () => void }) {
  const { requester } = useRequester()
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
            This Ticket doesn't exist, or isn't one of {requester?.name ?? 'yours'}'s Tickets.
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
            <ReadOnlyField label="Requester" value={requester?.name ?? '—'} />
            <ReadOnlyField label="Category" value={categoryName(detail.ticket.categoryId)} />
            <ReadOnlyField label="Related System" value={relatedSystemName(detail.ticket.relatedSystemId)} />
            <ReadOnlyField
              label="Requested Priority"
              value={<PriorityBadge priority={detail.ticket.requestedPriority} />}
            />
            <ReadOnlyField label="IT Priority" value={<PriorityBadge priority={detail.ticket.itPriority} />} />
            <ReadOnlyField label="Current Status" value={<StatusBadge status={detail.ticket.currentStatus} />} />
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
        </>
      )}
    </div>
  )
}

export default RequesterTicketDetail
