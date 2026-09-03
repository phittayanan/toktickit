import prisma from '../prisma'
import { MAX_ACTIVE_ATTACHMENTS_PER_TICKET } from '../schemas/attachment.schema'
import { TicketNotFoundError } from './ticket.service'

export { TicketNotFoundError }

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
async function findOwnedActiveAttachment(attachmentId: number, requesterId: number) {
  const attachment = await prisma.attachment.findUnique({
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
// only of an Attachment that is currently active.
export async function removeAttachment(attachmentId: number, requesterId: number, removalReason: string) {
  await findOwnedActiveAttachment(attachmentId, requesterId)

  return prisma.attachment.update({
    where: { id: attachmentId },
    data: {
      removedAt: new Date(),
      removedByRequesterId: requesterId,
      removalReason,
    },
  })
}
