import type { Priority, Role } from './api'

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

// Role badge (docs/lab-03/ui-spec.md §2.2): Requester Neutral, IT Staff
// Info, Administrator a Primary green outline.
export function RoleBadge({ role }: { role: Role }) {
  const classByRole: Record<Role, string> = {
    REQUESTER: 'tk-badge--neutral',
    IT_STAFF: 'tk-badge--info',
    ADMINISTRATOR: 'tk-badge--outline',
  }
  const labelByRole: Record<Role, string> = {
    REQUESTER: 'Requester',
    IT_STAFF: 'IT Staff',
    ADMINISTRATOR: 'Administrator',
  }

  return <span className={`badge rounded-pill ${classByRole[role]}`}>{labelByRole[role]}</span>
}
