import prisma from '../prisma'
import { MAX_ACTIVE_ATTACHMENTS_PER_TICKET } from '../schemas/attachment.schema'
import { isFinished } from './statusTransitions.service'
import { TicketFinishedError, TicketNotFoundError } from './ticket.service'

export { TicketFinishedError, TicketNotFoundError }

// BR-15: the 5-active-attachments cap was reached for this Ticket.
export class AttachmentLimitReachedError extends Error {
  constructor() {
    super(`This Ticket already has ${MAX_ACTIVE_ATTACHMENTS_PER_TICKET} active attachments`)
  }
}

// BR-21: missing, not-owned (via the Ticket), or already-removed Attachment
// — all indistinguishable 404s, mirroring TicketNotFoundError.
export class AttachmentNotFoundError extends Error {
  constructor() {
    super('Attachment not found')
  }
}

export interface UploadedFile {
  originalname: string
  filename: string
  mimetype: string
  size: number
}

// docs/lab-03/api-spec.md §1.5: on the two Attachment endpoints a finished
// Ticket is refused directly after the lookup, before the input is
// validated. These two answer whether the caller's own Ticket, or the Ticket
// of their own active Attachment, is finished (BR-31); a Ticket or
// Attachment the caller does not reach is not finished as far as they can
// tell, and the request goes on to its Lab 2 answer.
export async function isOwnTicketFinished(ticketId: number, requesterId: number): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })

  return !!ticket && ticket.requesterId === requesterId && isFinished(ticket.currentStatus)
}

export async function isOwnAttachmentTicketFinished(attachmentId: number, requesterId: number): Promise<boolean> {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId }, include: { ticket: true } })

  return (
    !!attachment &&
    attachment.ticket.requesterId === requesterId &&
    !attachment.removedAt &&
    isFinished(attachment.ticket.currentStatus)
  )
}

export async function uploadAttachment(ticketId: number, requesterId: number, file: UploadedFile) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
  if (!ticket || ticket.requesterId !== requesterId) {
    throw new TicketNotFoundError()
  }

  // BR-15: the active count is checked immediately before persisting,
  // inside this request. ADR-0003 relies on the client uploading
  // sequentially, but `SELECT ... FOR UPDATE` on the Ticket row also makes
  // the count-then-insert race-free against any concurrent request for the
  // same Ticket (e.g. a retry racing the original), not just a compliant
  // client — a second transaction blocks on the lock until the first
  // commits its insert, so it recounts to a value that already reflects it.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`

    // BR-31, read under the lock: the Ticket may have been finished since
    // the route's own check.
    const locked = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    if (isFinished(locked.currentStatus)) {
      throw new TicketFinishedError()
    }

    const activeCount = await tx.attachment.count({
      where: { ticketId, removedAt: null },
    })
    if (activeCount >= MAX_ACTIVE_ATTACHMENTS_PER_TICKET) {
      throw new AttachmentLimitReachedError()
    }

    return tx.attachment.create({
      data: {
        ticketId,
        uploadedByRequesterId: requesterId,
        originalFilename: file.originalname,
        storedFilename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    })
  })
}

// Attachments are keyed at /api/attachments/:id, not nested under a Ticket,
// so ownership is checked by joining through the Attachment's Ticket
// (BR-21) rather than via the Ticket route's own ownership check.
async function findOwnedActiveAttachment(
  attachmentId: number,
  requesterId: number,
  client: Pick<typeof prisma, 'attachment'> = prisma,
) {
  const attachment = await client.attachment.findUnique({
    where: { id: attachmentId },
    include: { ticket: true },
  })
  if (!attachment || attachment.ticket.requesterId !== requesterId || attachment.removedAt) {
    throw new AttachmentNotFoundError()
  }
  return attachment
}

// GET /api/attachments/:id/download — returns the active Attachment row so
// the route can stream its file content; a removed or not-owned Attachment
// is indistinguishable from a missing one (BR-20/BR-21).
export async function getDownloadableAttachment(attachmentId: number, requesterId: number) {
  return findOwnedActiveAttachment(attachmentId, requesterId)
}

// POST /api/attachments/:id/remove — BR-18/BR-19: soft removal only, and
// only of an Attachment that is currently active. Runs the check-then-write
// inside one transaction with a row lock (same pattern as uploadAttachment)
// so two concurrent removals of the same Attachment can't both pass the
// active check and silently overwrite each other's removal metadata — the
// second blocks on the lock, then re-reads and correctly 404s.
export async function removeAttachment(attachmentId: number, requesterId: number, removalReason: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${attachmentId} FOR UPDATE`

    const attachment = await findOwnedActiveAttachment(attachmentId, requesterId, tx)
    // BR-31
    if (isFinished(attachment.ticket.currentStatus)) {
      throw new TicketFinishedError()
    }

    return tx.attachment.update({
      where: { id: attachmentId },
      data: {
        removedAt: new Date(),
        removedByRequesterId: requesterId,
        removalReason,
      },
    })
  })
}
