import type { ActionTakenStatus, TicketStatus } from './api'

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

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status
}

export const ACTION_STATUS_LABELS: Record<ActionTakenStatus, string> = {
  PLANNED: 'Planned',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}
