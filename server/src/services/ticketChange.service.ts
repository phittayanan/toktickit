import type { Prisma, Ticket } from '../../generated/prisma/client'
import prisma from '../prisma'
import { now } from '../clock'
import { isFinished, UNFINISHED } from './statusTransitions.service'

// Every write against a Ticket row comes through here (CONTEXT.md, Ticket
// Change): this module locks the row, re-reads it, refuses a missing or
// Finished Ticket, and stamps the time. Who may reach the Ticket is the
// caller's to check, before it gets here. Rows are always taken in one
// order: User rows, then Tickets, then the Ticket's child rows.

// Missing or not-owned Ticket — indistinguishable 404 per ADR-0004/BR-21.
// Shared by every route that looks a Ticket up by id (detail, attachments).
export class TicketNotFoundError extends Error {
  constructor() {
    super('Ticket not found')
  }
}

// BR-31: a change was asked of a Closed or Cancelled Ticket.
export class TicketFinishedError extends Error {
  constructor() {
    super('This ticket is closed or cancelled and can no longer be changed.')
  }
}

// What a change may set on a Ticket. The last-updated time is not among
// them: this module records it, whenever the Ticket is written.
type TicketFields = Omit<Prisma.TicketUncheckedUpdateManyInput, 'updatedAt'>

export interface TicketChangeContext {
  tx: Prisma.TransactionClient
  // The one time of this change, read under the lock.
  time: Date
  // Sets `fields` on the Ticket and records `time` as its last-updated
  // time. A rule that never calls this leaves the Ticket row as it is: when
  // nothing changes, and for the changes that do not move that time.
  write(fields?: TicketFields): Promise<Ticket>
}

export interface TicketChange<Result> {
  // Locks the User rows the change depends on, ahead of the Ticket, and may
  // refuse it. Runs in the same transaction, before any Ticket check.
  lockUsers?(tx: Prisma.TransactionClient): Promise<void>
  // The caller's own checks and writes. It sees the Ticket as it stands
  // under the lock, so what it checks is still true when it writes, and it
  // refuses by throwing, which undoes the whole change.
  rule(ticket: Ticket, change: TicketChangeContext): Promise<Result>
}

// One Ticket Change. A finished Ticket takes no change (BR-31), which
// api-spec.md §1.5 reports ahead of every conflict a rule can raise.
export async function changeTicket<Result>(
  ticketId: number,
  { lockUsers, rule }: TicketChange<Result>,
): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    await lockUsers?.(tx)
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`

    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      throw new TicketNotFoundError()
    }
    if (isFinished(ticket.currentStatus)) {
      throw new TicketFinishedError()
    }

    const time = now()
    return rule(ticket, {
      tx,
      time,
      write: (fields) => tx.ticket.update({ where: { id: ticketId }, data: { ...fields, updatedAt: time } }),
    })
  })
}

// Sets the same fields on every Unfinished Ticket that `where` matches, as
// part of the caller's transaction, and answers how many it changed. The
// Tickets are locked in id order, and `where` is judged again under the
// locks, so a Ticket finished or reassigned meanwhile is left alone.
export async function changeUnfinishedTickets(
  tx: Prisma.TransactionClient,
  where: Prisma.TicketWhereInput,
  fields: (time: Date) => TicketFields,
): Promise<number> {
  const matching = { ...where, ...UNFINISHED }
  const tickets = await tx.ticket.findMany({ where: matching, select: { id: true } })
  const ids = tickets.map((ticket) => ticket.id)
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`

  const time = now()
  const changed = await tx.ticket.updateMany({
    where: { ...matching, id: { in: ids } },
    data: { ...fields(time), updatedAt: time },
  })

  return changed.count
}

// `lockUsers` for a change that writes a row naming a User: takes the lock
// that row's reference to them needs, in its place in the order.
export function lockAuthor(authorId: number) {
  return async (tx: Prisma.TransactionClient): Promise<void> => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${authorId} FOR KEY SHARE`
  }
}
