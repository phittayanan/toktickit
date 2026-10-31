import { randomInt, randomUUID } from 'node:crypto'
import prisma from '../../../src/prisma'
import type { Prisma, TicketStatus } from '../../../generated/prisma/client'

export const ALL_STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'REOPENED',
]

// A fixed "now" far past any row another test file leaves in the shared
// database, so the recent lists hold only what a test writes around it.
export const FIXED_NOW = new Date('2099-06-15T05:00:00.000Z')
// BR-28 for FIXED_NOW: 00:00 Bangkok on 2099-06-09.
export const WINDOW_START = new Date('2099-06-08T17:00:00.000Z')

// A week of its own for a test that reads a list across every Ticket: the
// shared database keeps every run's rows, and a random far-future year
// holds no other. Sign in after setting the clock to `now`, or the session
// has already expired.
export function freshWindow() {
  const year = randomInt(3000, 9000)

  return { now: new Date(`${year}-06-15T05:00:00.000Z`), start: new Date(`${year}-06-08T17:00:00.000Z`) }
}

export const minutesAfter = (start: Date, minutes: number) => new Date(start.getTime() + minutes * 60_000)

export async function referenceIds() {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })

  return { categoryId: category.id, relatedSystemId: relatedSystem.id }
}

type TicketFields = Partial<Omit<Prisma.TicketUncheckedCreateInput, 'requesterId'>> & { requesterId: number }

// A Ticket row exactly as a test wants it, status and times included: the
// flows that reach each status belong to other tests.
export function ticketRow(reference: { categoryId: number; relatedSystemId: number }, fields: TicketFields) {
  return {
    ticketNumber: `DASH-${randomUUID()}`,
    categoryId: reference.categoryId,
    relatedSystemId: reference.relatedSystemId,
    summary: 'dashboard test ticket',
    description: 'A ticket description that no dashboard may return.',
    requestedPriority: 'MEDIUM',
    itPriority: 'LOW',
    ...fields,
  } satisfies Prisma.TicketUncheckedCreateInput
}

export function actionTakenRow(
  fields: Pick<Prisma.ActionTakenUncheckedCreateInput, 'ticketId' | 'assigneeId' | 'status' | 'actionAt'> &
    Partial<Prisma.ActionTakenUncheckedCreateInput>,
) {
  return {
    description: 'dashboard test action',
    createdById: fields.assigneeId,
    clientRequestId: randomUUID(),
    ...(fields.status === 'DONE' && { result: 'Done.' }),
    ...fields,
  } satisfies Prisma.ActionTakenUncheckedCreateInput
}
