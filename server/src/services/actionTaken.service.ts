import { Prisma, type User } from '../../generated/prisma/client'
import prisma from '../prisma'
import { ASSIGNEE_MESSAGE, type CreateActionTakenInput, type EditActionTakenInput } from '../schemas/actionTaken.schema'
import { requireReachableTicket } from './publicComment.service'
import { isFinished } from './statusTransitions.service'
import { TicketValidationError } from './ticket.service'
import { changeTicket, lockAuthor } from './ticketChange.service'

// The Actions Taken of a Ticket (specification.md §5.1 to §5.3). Creating or
// editing one is a Ticket Change (BR-12), so all of them serialise on the
// Ticket row. An Action Taken is shared with the Requester (BR-17), and
// nothing here deletes one (BR-11).

// A path naming an Action Taken that is missing, or that belongs to another
// Ticket (BR-01).
export class ActionTakenNotFoundError extends Error {
  constructor() {
    super('Action Taken not found')
  }
}

// BR-15: the session user is not its creator, its assignee, or an
// Administrator.
export class ActionTakenEditForbiddenError extends Error {
  constructor() {
    super('Only the creator, the person performing it, or an Administrator can edit this action.')
  }
}

// BR-13: the edit started from a version that is no longer the current one.
export class ActionTakenChangedError extends Error {
  constructor() {
    super('This action was changed by someone else. Reload to see the latest version.')
  }
}

// BR-10: Done and Cancelled are final.
export class ActionTakenFinalError extends Error {
  constructor() {
    super('A Done or Cancelled action can no longer be changed.')
  }
}

const ACTION_TAKEN_SELECT = {
  id: true,
  actionAt: true,
  description: true,
  result: true,
  status: true,
  assignee: { select: { id: true, name: true } },
  followUpRequired: true,
  followUpNote: true,
  attachmentNotes: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  version: true,
  ticket: { select: { currentStatus: true } },
} satisfies Prisma.ActionTakenSelect

type ActionTakenRow = Prisma.ActionTakenGetPayload<{ select: typeof ACTION_TAKEN_SELECT }>

// BR-15, and always false for a Requester.
function isEditor(row: { assigneeId: number; createdById: number }, user: User): boolean {
  return (
    user.role === 'ADMINISTRATOR' ||
    (user.role === 'IT_STAFF' && (row.createdById === user.id || row.assigneeId === user.id))
  )
}

// The `ActionTaken` shape (api-spec.md §1.5).
function toActionTaken({ ticket, ...row }: ActionTakenRow, user: User) {
  return {
    ...row,
    canEdit:
      row.status === 'PLANNED' &&
      !isFinished(ticket.currentStatus) &&
      isEditor({ assigneeId: row.assignee.id, createdById: row.createdBy.id }, user),
  }
}

// BR-04: only an active IT Staff or Administrator user can be made assignee.
// The row is locked as for an owner (BR-25), so a deactivation or role change
// made at the same moment is judged wholly before or wholly after this.
async function requireEligibleAssignee(tx: Prisma.TransactionClient, assigneeId: number): Promise<void> {
  const eligible = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "User"
    WHERE "id" = ${assigneeId} AND "isActive" AND "role" IN ('IT_STAFF', 'ADMINISTRATOR')
    FOR SHARE`

  if (eligible.length === 0) {
    throw new TicketValidationError('assigneeId', ASSIGNEE_MESSAGE)
  }
}

// GET /api/tickets/:id/actions-taken: newest created first, every status.
export async function listActionsTaken(ticketId: number, user: User) {
  await requireReachableTicket(ticketId, user)

  const rows = await prisma.actionTaken.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: ACTION_TAKEN_SELECT,
  })

  return rows.map((row) => toActionTaken(row, user))
}

// What a `clientRequestId` already made on this Ticket, or null (BR-14).
export async function findCreatedActionTaken(ticketId: number, clientRequestId: string, user: User) {
  const row = await prisma.actionTaken.findUnique({
    where: { ticketId_clientRequestId: { ticketId, clientRequestId } },
    select: ACTION_TAKEN_SELECT,
  })

  return row && toActionTaken(row, user)
}

// POST /api/staff/tickets/:id/actions-taken (BR-01 to BR-12). `created` is
// false when a parallel repeat of this request got there first: a copy that
// missed the lookup waits for the Ticket and then loses on the unique key,
// or finds the Ticket finished since, and either way answers as a repeat.
export async function createActionTaken(
  ticketId: number,
  user: User,
  clientRequestId: string,
  { actionAt, assigneeId = user.id, ...fields }: CreateActionTakenInput,
) {
  try {
    const actionTaken = await changeTicket(ticketId, {
      lockUsers: async (tx) => {
        await lockAuthor(user.id)(tx)
        await requireEligibleAssignee(tx, assigneeId)
      },
      rule: async (_ticket, { tx, time, write }) => {
        await write()

        const row = await tx.actionTaken.create({
          data: {
            ...fields,
            ticketId,
            clientRequestId,
            assigneeId,
            actionAt: actionAt ?? time,
            createdById: user.id,
            createdAt: time,
            updatedAt: time,
          },
          select: ACTION_TAKEN_SELECT,
        })

        return toActionTaken(row, user)
      },
    })

    return { actionTaken, created: true }
  } catch (err) {
    const actionTaken = await findCreatedActionTaken(ticketId, clientRequestId, user)
    if (actionTaken) {
      return { actionTaken, created: false }
    }
    throw err
  }
}

// api-spec.md §1.3 step 4, ahead of the body: the Action Taken is on this
// Ticket.
export async function requireActionTakenOnTicket(ticketId: number, actionTakenId: number): Promise<void> {
  const row = await prisma.actionTaken.findUnique({ where: { id: actionTakenId }, select: { ticketId: true } })

  if (row?.ticketId !== ticketId) {
    throw new ActionTakenNotFoundError()
  }
}

// PUT /api/staff/tickets/:id/actions-taken/:actionTakenId (BR-08 to BR-15),
// checked in the order of api-spec.md §1.3. Only a changed assignee is judged
// (BR-04). That reads the row ahead of the lock, and an edit that raced with
// another one still ends on the version check.
export async function editActionTaken(
  ticketId: number,
  actionTakenId: number,
  user: User,
  { expectedVersion, ...fields }: EditActionTakenInput,
) {
  return changeTicket(ticketId, {
    lockUsers: async (tx) => {
      const { assigneeId } = await tx.actionTaken.findUniqueOrThrow({
        where: { id: actionTakenId },
        select: { assigneeId: true },
      })

      if (fields.assigneeId !== assigneeId) {
        await requireEligibleAssignee(tx, fields.assigneeId)
      }
    },
    rule: async (_ticket, { tx, time, write }) => {
      const current = await tx.actionTaken.findUniqueOrThrow({ where: { id: actionTakenId } })

      if (!isEditor(current, user)) {
        throw new ActionTakenEditForbiddenError()
      }
      if (current.version !== expectedVersion) {
        throw new ActionTakenChangedError()
      }
      if (current.status !== 'PLANNED') {
        throw new ActionTakenFinalError()
      }

      await write()

      const row = await tx.actionTaken.update({
        where: { id: actionTakenId },
        data: { ...fields, version: { increment: 1 }, updatedAt: time },
        select: ACTION_TAKEN_SELECT,
      })

      return toActionTaken(row, user)
    },
  })
}
