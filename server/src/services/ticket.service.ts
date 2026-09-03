import prisma from '../prisma'
import { nextTicketNumber } from './ticketNumber.service'
import type { CreateTicketInput } from '../schemas/ticket.schema'

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
      },
    })
  })
}
