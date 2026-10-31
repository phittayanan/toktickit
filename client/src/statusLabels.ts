import type { TicketStatus } from './api'

// Each Current Status in words (docs/lab-03/ui-spec.md §2.2), as its badge
// and the status select say it.
const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  REOPENED: 'Reopened',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

// Every status except Closed and Cancelled.
export const UNFINISHED_STATUSES = (Object.keys(STATUS_LABELS) as TicketStatus[]).filter(
  (status) => status !== 'CLOSED' && status !== 'CANCELLED',
)

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status
}
