import type { Prisma, User } from '../../generated/prisma/client'
import prisma from '../prisma'
import { changeTicket, lockAuthor } from './ticketChange.service'

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
// and the time is the server's. As a Ticket Change, a Ticket finished at the
// same moment takes no note, but the Ticket row is not written: a note
// changes nothing a Requester can see, the Ticket's last-updated time
// included (BR-37).
export async function createInternalNote(ticketId: number, author: User, body: string) {
  return changeTicket(ticketId, {
    lockUsers: lockAuthor(author.id),
    rule: (_ticket, { tx, time }) =>
      tx.internalNote.create({
        data: { ticketId, authorId: author.id, body, createdAt: time },
        select: ENTRY_SELECT,
      }),
  })
}
