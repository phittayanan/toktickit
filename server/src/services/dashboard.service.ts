import type { Prisma, Role, TicketStatus } from '../../generated/prisma/client'
import { now } from '../clock'
import prisma from '../prisma'
import { recentWindowStart } from './dashboardWindow'
import { isFinished, TICKET_STATUSES, UNFINISHED } from './statusTransitions.service'

// The dashboards of Lab 4 api-spec.md §5. Every metric is read from the
// rows on each request (BR-27), and each query selects the documented
// fields only, so a description, comment, or note can never be returned.

const LIST_LIMIT = 5
const OPEN_STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const STAFF_STATUSES = TICKET_STATUSES.filter((status) => !isFinished(status))
const IT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
const ROLES: readonly Role[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']

// BR-28: from the start of the window up to now.
function recentWindow(): Prisma.DateTimeFilter {
  const time = now()

  return { gte: recentWindowStart(time), lte: time }
}

// `byStatus` and `byItPriority` always hold every key (api-spec.md §5.2).
function countsByKey<K extends string>(keys: readonly K[], counted: { key: K; count: number }[]): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
  for (const { key, count } of counted) counts[key] = count

  return counts
}

export async function requesterDashboard(requesterId: number) {
  const window = recentWindow()
  const ticketFields = { id: true, ticketNumber: true, summary: true, currentStatus: true } as const

  const [openCount, waitingForRequesterCount, recentlyUpdated, recentlyResolved] = await Promise.all([
    prisma.ticket.count({ where: { requesterId, currentStatus: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { requesterId, currentStatus: 'WAITING_FOR_REQUESTER' } }),
    prisma.ticket.findMany({
      where: { requesterId, updatedAt: window },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { ...ticketFields, updatedAt: true },
    }),
    prisma.ticket.findMany({
      where: { requesterId, currentStatus: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: window },
      orderBy: [{ resolvedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { ...ticketFields, resolvedAt: true },
    }),
  ])

  return { openCount, waitingForRequesterCount, recentlyUpdated, recentlyResolved }
}

const STAFF_TICKET_FIELDS = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  owner: { select: { id: true, name: true } },
  updatedAt: true,
} satisfies Prisma.TicketSelect

export async function staffDashboard(userId: number) {
  const myPlanned = {
    status: 'PLANNED',
    assigneeId: userId,
    ticket: UNFINISHED,
  } satisfies Prisma.ActionTakenWhereInput

  const [
    unassignedCount,
    ownedByMeCount,
    myPlannedActionsTakenCount,
    perStatus,
    perItPriority,
    myPlannedActionsTaken,
    urgent,
    recentlyUpdated,
  ] = await Promise.all([
    prisma.ticket.count({ where: { ...UNFINISHED, ownerId: null } }),
    prisma.ticket.count({ where: { ...UNFINISHED, ownerId: userId } }),
    prisma.actionTaken.count({ where: myPlanned }),
    prisma.ticket.groupBy({ by: ['currentStatus'], where: UNFINISHED, _count: true }),
    prisma.ticket.groupBy({ by: ['itPriority'], where: UNFINISHED, _count: true }),
    prisma.actionTaken.findMany({
      where: myPlanned,
      orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        ticketId: true,
        description: true,
        actionAt: true,
        ticket: { select: { ticketNumber: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { ...UNFINISHED, itPriority: { in: ['HIGH', 'MEDIUM'] } },
      // The Priority enum is declared low to high, so descending is High first.
      orderBy: [{ itPriority: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: STAFF_TICKET_FIELDS,
    }),
    prisma.ticket.findMany({
      where: { updatedAt: recentWindow() },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: STAFF_TICKET_FIELDS,
    }),
  ])

  return {
    unassignedCount,
    ownedByMeCount,
    myPlannedActionsTakenCount,
    byStatus: countsByKey(
      STAFF_STATUSES,
      perStatus.map((row) => ({ key: row.currentStatus, count: row._count })),
    ),
    byItPriority: countsByKey(
      IT_PRIORITIES,
      perItPriority.map((row) => ({ key: row.itPriority, count: row._count })),
    ),
    myPlannedActionsTaken: myPlannedActionsTaken.map(({ ticket, ...action }) => ({
      ...action,
      ticketNumber: ticket.ticketNumber,
    })),
    urgent,
    recentlyUpdated,
  }
}

export async function adminDashboard() {
  const perRole = await prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: true })

  return { activeUsers: countsByKey(ROLES, perRole.map((row) => ({ key: row.role, count: row._count }))) }
}
