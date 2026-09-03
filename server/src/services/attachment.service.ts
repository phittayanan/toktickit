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
