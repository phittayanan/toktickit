import type { Priority, Role } from './api'
import { statusLabel } from './statusLabels'

// Shared Priority/Current Status badges (ui-spec.md §10) — used by the
// Requester and Staff ticket screens alike so they render Tickets
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

// Current Status badge (docs/lab-03/ui-spec.md §2.2), one label and style
// per status. Resolved carries a check icon beside its label.
const STATUS_CLASSES: Record<string, string> = {
  NEW: 'text-bg-success',
  OPEN: 'tk-badge--info',
  IN_PROGRESS: 'tk-badge--in-progress',
  WAITING_FOR_REQUESTER: 'tk-badge--warning',
  RESOLVED: 'tk-badge--success',
  REOPENED: 'tk-badge--error',
  CLOSED: 'tk-badge--neutral',
  CANCELLED: 'tk-badge--neutral tk-badge--outlined',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge rounded-pill ${STATUS_CLASSES[status] ?? 'tk-badge--neutral'}`}>
      {status === 'RESOLVED' && <span aria-hidden="true">✓ </span>}
      {statusLabel(status)}
    </span>
  )
}

// Flag badge (docs/lab-03/ui-spec.md §2.2): the Requester has indicated
// that the problem appears resolved.
export function AppearsResolvedBadge() {
  return (
    <span className="badge rounded-pill tk-badge--success-outline">
      <span className="tk-badge__icon" aria-hidden="true">
        ⚑
      </span>
      Requester: appears resolved
    </span>
  )
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

// Account badge (docs/lab-03/ui-spec.md §2.2): Active Success, Inactive
// Neutral.
export function AccountBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`badge rounded-pill ${isActive ? 'tk-badge--success' : 'tk-badge--neutral'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}
