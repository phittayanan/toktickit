import type { Prisma, User } from '../../generated/prisma/client'
import prisma from '../prisma'
import { now } from '../clock'
import { isFinished } from './statusTransitions.service'
import { TicketFinishedError, TicketNotFoundError } from './ticket.service'

// Internal Notes are read and written here and nowhere else, and only the
// /api/staff routes, which no Requester passes, call this (ADR-0010,
// BR-37).

// The `Entry` shape of docs/lab-03/api-spec.md §1.7. `author.role` is the
// author's current role.
const ENTRY_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} satisfies Prisma.InternalNoteSelect

// GET /api/staff/tickets/:id/notes: newest first.
export function listInternalNotes(ticketId: number) {
  return prisma.internalNote.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: ENTRY_SELECT,
  })
}

// POST /api/staff/tickets/:id/notes (BR-34): the author is the session user
// and the time is the server's. The Ticket row is locked while its status
// is checked, so a Ticket finished at the same moment takes no note, and it
// is not written: a note changes nothing a Requester can see, the Ticket's
// last-updated time included (BR-37). The author's row is locked first, as
// the note's author reference needs, so the rows are taken user then Ticket,
// the order User Management takes them in (BR-25).
export async function createInternalNote(ticketId: number, author: User, body: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${author.id} FOR KEY SHARE`
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`

    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      throw new TicketNotFoundError()
    }
    if (isFinished(ticket.currentStatus)) {
      throw new TicketFinishedError()
    }

    return tx.internalNote.create({
      data: { ticketId, authorId: author.id, body, createdAt: now() },
      select: ENTRY_SELECT,
    })
  })
}
