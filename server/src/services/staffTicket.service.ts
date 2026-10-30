import type { Prisma, Priority } from '../../generated/prisma/client'
import prisma from '../prisma'
import type { OwnerInput, StatusInput } from '../schemas/staffTicket.schema'
import { allowedTransitions, canTransition } from './statusTransitions.service'
import { TicketNotFoundError, TicketValidationError } from './ticket.service'
import { changeTicket } from './ticketChange.service'

// BR-23: the Ticket's owner is no longer the one the client last saw.
export class OwnerChangedError extends Error {
  constructor() {
    super('The ticket owner was changed by someone else.')
  }
}

// BR-30: the Ticket's status is no longer the one the client last saw.
export class StatusChangedError extends Error {
  constructor() {
    super('The ticket status was changed by someone else.')
  }
}

// BR-28: the status asked for is not reachable from the current one.
export class InvalidTransitionError extends Error {
  constructor() {
    super('The ticket cannot be moved to that status from its current status.')
  }
}

// BR-29: a Ticket with no owner was asked to be resolved.
export class OwnerRequiredError extends Error {
  constructor() {
    super('A ticket needs an owner before it can be resolved.')
  }
}

// Lab 4 BR-19: the Resolution Gate, no Done Action Taken.
export class DoneActionRequiredError extends Error {
  constructor() {
    super('A ticket needs at least one Done action before it can be resolved.')
  }
}

// Lab 4 BR-19: the Resolution Gate, a Planned Action Taken is left.
export class PlannedActionRemainsError extends Error {
  constructor() {
    super('Finish or cancel every Planned action before resolving this ticket.')
  }
}

// The largest id a row can have. A larger one names no user, and is never
// sent to the database, which would refuse it.
const MAX_ID = 2_147_483_647

// What a `StaffTicket` is built from (api-spec.md §5.2). Attachments have
// the Lab 2 element shape, active and soft-removed alike, newest first.
const STAFF_TICKET = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  requester: { select: { id: true, name: true, email: true, isActive: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  owner: { select: { id: true, name: true } },
  ownerChangedAt: true,
  resolutionSummary: true,
  resolvedAt: true,
  requesterResolvedAt: true,
  _count: { select: { publicComments: true, internalNotes: true } },
  actionsTaken: { select: { status: true } },
  attachments: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      removedAt: true,
      removedByRequesterId: true,
      removalReason: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect

type StaffTicketRow = Prisma.TicketGetPayload<{ select: typeof STAFF_TICKET }>

// The `StaffTicket` shape. `allowedTransitions` are the BR-28 targets from
// the current status, none for a finished Ticket, whatever the Resolution
// Gate says; `actionTakenCounts` is what the client shows the gate's state by
// (Lab 4 api-spec.md §3.2).
function toStaffTicket({ _count, actionsTaken, attachments, createdAt, updatedAt, ...ticket }: StaffTicketRow) {
  const { owner, ownerChangedAt, resolutionSummary, resolvedAt, requesterResolvedAt, ...fields } = ticket

  return {
    ...fields,
    allowedTransitions: allowedTransitions(ticket.currentStatus),
    owner,
    ownerChangedAt,
    resolutionSummary,
    resolvedAt,
    requesterResolvedAt,
    publicCommentCount: _count.publicComments,
    internalNoteCount: _count.internalNotes,
    actionTakenCounts: {
      planned: actionsTaken.filter((action) => action.status === 'PLANNED').length,
      done: actionsTaken.filter((action) => action.status === 'DONE').length,
    },
    attachments,
    createdAt,
    updatedAt,
  }
}

export async function ticketExists(ticketId: number): Promise<boolean> {
  return (await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } })) !== null
}

// GET /api/staff/tickets/:id: any Requester's Ticket (FR-14). The staff
// ticket operations answer with it too, read once their change is
// committed.
export async function getStaffTicket(ticketId: number) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: STAFF_TICKET })
  if (!ticket) {
    throw new TicketNotFoundError()
  }

  return toStaffTicket(ticket)
}

// PUT /api/staff/tickets/:id/owner (BR-21 to BR-24): claim, assign,
// reassign, or unassign, checked in the order of api-spec.md §1.5. The
// user to be made owner is locked ahead of the Ticket, so that a
// deactivation or role change made at the same moment (BR-25) is judged
// wholly before or wholly after this.
export async function changeOwner(ticketId: number, input: OwnerInput) {
  const { ownerId, expectedOwnerId } = input

  await changeTicket(ticketId, {
    lockUsers: async (tx) => {
      // BR-21: only an active IT Staff or Administrator user can be made
      // owner. An unknown, inactive, or Requester id is one answer.
      if (ownerId !== null) {
        const eligible =
          ownerId >= 1 && ownerId <= MAX_ID
            ? await tx.$queryRaw<{ id: number }[]>`
                SELECT "id" FROM "User"
                WHERE "id" = ${ownerId} AND "isActive" AND "role" IN ('IT_STAFF', 'ADMINISTRATOR')
                FOR SHARE`
            : []
        if (eligible.length === 0) {
          throw new TicketValidationError('ownerId', 'Owner must be an active IT Staff or Administrator user.')
        }
      }
    },
    rule: async (ticket, { time, write }) => {
      if (ticket.ownerId !== expectedOwnerId) {
        throw new OwnerChangedError()
      }

      // api-spec.md §5.4: setting the owner it already has changes nothing.
      if (ownerId === ticket.ownerId) {
        return
      }

      await write({
        ownerId,
        ownerChangedAt: time,
        // BR-24: giving an owner to a New Ticket opens it.
        ...(ticket.currentStatus === 'NEW' && ownerId !== null && { currentStatus: 'OPEN' as const }),
      })
    },
  })

  return getStaffTicket(ticketId)
}

// PUT /api/staff/tickets/:id/it-priority (BR-26): the Requested Priority
// is never changed.
export async function changeItPriority(ticketId: number, itPriority: Priority) {
  await changeTicket(ticketId, {
    rule: async (ticket, { write }) => {
      if (itPriority !== ticket.itPriority) {
        await write({ itPriority })
      }
    },
  })

  return getStaffTicket(ticketId)
}

// POST /api/staff/tickets/:id/status (BR-28 to BR-30, BR-33), checked in
// the order of api-spec.md §1.5.
export async function changeStatus(ticketId: number, input: StatusInput) {
  await changeTicket(ticketId, {
    rule: async (ticket, { tx, time, write }) => {
      if (ticket.currentStatus !== input.expectedStatus) {
        throw new StatusChangedError()
      }
      if (!canTransition(ticket.currentStatus, input.status)) {
        throw new InvalidTransitionError()
      }
      if (input.status === 'RESOLVED' && ticket.ownerId === null) {
        throw new OwnerRequiredError()
      }
      // Lab 4 BR-21: read under the Ticket lock that Action Taken writes also
      // take, so a Planned one and this move are serialised.
      if (input.status === 'RESOLVED') {
        if ((await tx.actionTaken.count({ where: { ticketId, status: 'DONE' } })) === 0) {
          throw new DoneActionRequiredError()
        }
        if ((await tx.actionTaken.count({ where: { ticketId, status: 'PLANNED' } })) > 0) {
          throw new PlannedActionRemainsError()
        }
      }

      await write({
        currentStatus: input.status,
        // Resolving stores the summary and its time, and clears the
        // Requester's "Problem Appears Resolved" flag (BR-33). Any other
        // transition leaves the resolution fields as they are.
        ...(input.status === 'RESOLVED' && {
          resolutionSummary: input.resolutionSummary,
          resolvedAt: time,
          requesterResolvedAt: null,
        }),
      })
    },
  })

  return getStaffTicket(ticketId)
}
