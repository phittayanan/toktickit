// BR-27: the Current Status values, as they appear on the wire.
export const TICKET_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

// BR-28: the statuses reachable from each status. Closed and Cancelled are
// terminal, and no status transitions to itself.
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: [],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from]
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

// BR-31: a Closed or Cancelled Ticket is finished, and read-only for
// everyone.
export function isFinished(status: TicketStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED'
}
