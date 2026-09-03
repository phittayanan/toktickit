import type { Priority } from './api'

// Shared Priority/Current Status badges (ui-spec.md §10) — used by both
// MyTickets and RequesterTicketDetail so the two screens render Tickets
// identically.
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-muted small">Not yet set</span>

  const classByPriority: Record<Priority, string> = {
    LOW: 'text-bg-success-subtle text-success-emphasis',
    MEDIUM: 'text-bg-warning-subtle text-warning-emphasis',
    HIGH: 'text-bg-danger-subtle text-danger-emphasis',
  }
  const labelByPriority: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }

  return <span className={`badge rounded-pill ${classByPriority[priority]}`}>{labelByPriority[priority]}</span>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge rounded-pill text-bg-success">{status === 'NEW' ? 'New' : status}</span>
}
