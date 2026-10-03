import type { Prisma } from '../../generated/prisma/client'
import prisma from '../prisma'
import type { StaffQueueQuery } from '../schemas/staffQueue.schema'

// A row of the Ticket Queue (api-spec.md §5.1).
const QUEUE_ROW = {
  id: true,
  ticketNumber: true,
  summary: true,
  requester: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  owner: { select: { id: true, name: true } },
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect

// `contains` is a LIKE pattern, in which `%`, `_`, and the escape character
// itself are not ordinary characters. Search is a plain substring match.
const literal = (search: string) => search.replace(/[\\%_]/g, '\\$&')

// The largest id a row can have. A larger one is well-formed and matches
// no row, and is never sent to the database, which would refuse it.
const MAX_ID = 2_147_483_647

function page<Row>(query: StaffQueueQuery, data: Row[], totalItems: number) {
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  }
}

// GET /api/staff/tickets: the Ticket Queue, the Tickets of every Requester
// (BR-44). Search and the filters combine with AND. `sessionUserId` is who
// `owner=me` means.
export async function listQueue(query: StaffQueueQuery, sessionUserId: number) {
  const ownerId = query.owner === 'me' ? sessionUserId : query.owner === 'unassigned' ? null : query.owner

  if ((ownerId ?? 0) > MAX_ID || (query.categoryId ?? 0) > MAX_ID) {
    return page<never>(query, [], 0)
  }

  const contains = query.search === undefined ? undefined : literal(query.search)

  const where: Prisma.TicketWhereInput = {
    ...(contains !== undefined && {
      OR: [
        { ticketNumber: { contains, mode: 'insensitive' } },
        { summary: { contains, mode: 'insensitive' } },
        { requester: { name: { contains, mode: 'insensitive' } } },
      ],
    }),
    ...(query.status !== undefined && { currentStatus: { in: query.status } }),
    ...(ownerId !== undefined && { ownerId }),
    ...(query.itPriority !== undefined && { itPriority: query.itPriority }),
    ...(query.categoryId !== undefined && { categoryId: query.categoryId }),
    ...(query.appearsResolved !== undefined && {
      requesterResolvedAt: query.appearsResolved ? { not: null } : null,
    }),
  }

  const [data, totalItems] = await Promise.all([
    prisma.ticket.findMany({
      where,
      // Ties are broken by id descending, whatever the direction, so the
      // order is total and no row repeats or is skipped between pages.
      orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: QUEUE_ROW,
    }),
    prisma.ticket.count({ where }),
  ])

  return page(query, data, totalItems)
}
