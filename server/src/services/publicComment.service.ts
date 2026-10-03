import type { Prisma, User } from '../../generated/prisma/client'
import prisma from '../prisma'
import { now } from '../clock'
import { isFinished } from './statusTransitions.service'
import { TicketFinishedError, TicketNotFoundError } from './ticket.service'

// Public Comments are read and written here and nowhere else, and nothing
// here reads an Internal Note (ADR-0010).

// The `Entry` shape of docs/lab-03/api-spec.md §1.7. `author.role` is the
// author's current role.
const ENTRY_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} satisfies Prisma.PublicCommentSelect

// api-spec.md §6: a Ticket's Public Comments are reachable by its Requester
// and by Staff. For a Requester, a Ticket that is missing and one that is
// another Requester's are the same 404 (BR-20).
export async function requireReachableTicket(ticketId: number, user: User): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { requesterId: true } })

  if (!ticket || (user.role === 'REQUESTER' && ticket.requesterId !== user.id)) {
    throw new TicketNotFoundError()
  }
}

// GET /api/tickets/:id/comments: newest first.
export async function listPublicComments(ticketId: number, user: User) {
  await requireReachableTicket(ticketId, user)

  return prisma.publicComment.findMany({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: ENTRY_SELECT,
  })
}

// POST /api/tickets/:id/comments (BR-34, BR-36): the author is the session
// user and the time is the server's. Any unfinished Ticket takes one,
// including a Resolved one. The Ticket row is locked while its status is
// checked, so a Ticket finished at the same moment takes no comment.
export async function createPublicComment(ticketId: number, user: User, body: string) {
  await requireReachableTicket(ticketId, user)

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`

    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    if (isFinished(ticket.currentStatus)) {
      throw new TicketFinishedError()
    }

    const time = now()
    // specification.md §7.1: a new Public Comment moves the Ticket's
    // last-updated time.
    await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: time } })

    return tx.publicComment.create({
      data: { ticketId, authorId: user.id, body, createdAt: time },
      select: ENTRY_SELECT,
    })
  })
}
