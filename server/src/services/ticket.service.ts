import { Prisma } from '../../generated/prisma/client'
import prisma from '../prisma'
import { nextTicketNumber } from './ticketNumber.service'
import type { CreateTicketInput, ListTicketsQuery } from '../schemas/ticket.schema'

// A field-specific validation failure that couldn't be caught by the zod
// schema alone — e.g. checking categoryId/relatedSystemId are active rows
// in the database (BR-10).
export class TicketValidationError extends Error {
  field: string

  constructor(field: string, message: string) {
    super(message)
    this.field = field
  }
}

// Missing or not-owned Ticket — indistinguishable 404 per ADR-0004/BR-21.
// Shared by every route that looks a Ticket up by id (detail, attachments).
export class TicketNotFoundError extends Error {
  constructor() {
    super('Ticket not found')
  }
}

export async function createTicket(input: CreateTicketInput, requesterId: number) {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findUnique({ where: { id: input.categoryId } }),
    prisma.relatedSystem.findUnique({ where: { id: input.relatedSystemId } }),
  ])

  if (!category || !category.isActive) {
    throw new TicketValidationError('categoryId', 'Category must be an active category')
  }
  if (!relatedSystem || !relatedSystem.isActive) {
    throw new TicketValidationError('relatedSystemId', 'Related System must be an active related system')
  }

  // Ticket Number generation (BR-05) and the Ticket insert happen in the
  // same transaction, per ADR-0002.
  return prisma.$transaction(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx)
    return tx.ticket.create({
      data: {
        ticketNumber,
        requesterId,
        categoryId: input.categoryId,
        relatedSystemId: input.relatedSystemId,
        summary: input.summary,
        description: input.description,
        requestedPriority: input.requestedPriority,
        // BR-26: IT Priority starts as the Requested Priority.
        itPriority: input.requestedPriority,
      },
    })
  })
}

// GET /api/tickets — paginated/searchable/filterable/sortable list of the
// requesting Requester's own Tickets (BR-22). Rows belonging to any other
// Requester are excluded unconditionally, regardless of filter/search.
export async function listTickets(query: ListTicketsQuery, requesterId: number) {
  const where: Prisma.TicketWhereInput = {
    requesterId,
    ...(query.categoryId !== undefined && { categoryId: query.categoryId }),
    ...(query.requestedPriority !== undefined && { requestedPriority: query.requestedPriority }),
    ...(query.itPriority !== undefined && { itPriority: query.itPriority }),
    ...(query.currentStatus !== undefined && { currentStatus: query.currentStatus }),
    ...(query.search !== undefined && {
      OR: [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  }

  const [data, totalItems] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        categoryId: true,
        requestedPriority: true,
        itPriority: true,
        currentStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.ticket.count({ where }),
  ])

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

// GET /api/tickets/:id — one Ticket owned by the requesting Requester,
// including every Attachment (active and soft-removed alike, per
// BR-20/AC-29 — the client splits them for display, ui-spec.md §9).
export async function getTicketById(ticketId: number, requesterId: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { attachments: { orderBy: { createdAt: 'desc' } } },
  })

  // Nonexistent and not-owned are indistinguishable 404s (ADR-0004/BR-21) —
  // never reveal to the caller which case it was.
  if (!ticket || ticket.requesterId !== requesterId) {
    throw new TicketNotFoundError()
  }

  return ticket
}
