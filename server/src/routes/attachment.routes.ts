import fs from 'node:fs'
import path from 'node:path'
import { Router, type NextFunction, type Response } from 'express'
import { parseJsonBody } from '../middleware/parseJsonBody'
import { requireRequesterRole } from '../middleware/requireRole'
import type { SessionRequest } from '../middleware/requireSession'
import { uploadSingleFile, UnsupportedFileTypeError, UPLOAD_DIR } from '../upload'
import { validateRemovalReason } from '../schemas/attachment.schema'
import { sendError } from '../apiError'
import {
  uploadAttachment,
  getDownloadableAttachment,
  removeAttachment,
  isOwnAttachmentTicketFinished,
  isOwnTicketFinished,
  TicketFinishedError,
  TicketNotFoundError,
  AttachmentLimitReachedError,
  AttachmentNotFoundError,
} from '../services/attachment.service'
import { rowIdOf } from './rowId'

const router = Router()

// docs/lab-03/api-spec.md §4.1 (BR-31): no Attachment is added to, or
// removed from, a Closed or Cancelled Ticket.
function sendTicketFinished(res: Response) {
  sendError(res, 409, 'TICKET_FINISHED', new TicketFinishedError().message)
}

router.post('/tickets/:id/attachments', requireRequesterRole, async (req: SessionRequest, res) => {
  const ticketId = rowIdOf(req.params.id)
  if (ticketId === null) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  // Before the upload is read at all (api-spec.md §1.5).
  if (await isOwnTicketFinished(ticketId, req.user!.id)) {
    sendTicketFinished(res)
    return
  }

  uploadSingleFile(req, res, async (err) => {
    if (err) {
      if (err instanceof UnsupportedFileTypeError) {
        res.status(400).json({ error: err.message, field: err.field })
        return
      }
      // multer's own error for exceeding limits.fileSize (BR-14).
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File exceeds the 5 MB limit', field: 'file' })
        return
      }
      console.error('POST /api/tickets/:id/attachments upload failed', err)
      res.status(500).json({ error: 'Unable to upload attachment' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'A file is required', field: 'file' })
      return
    }

    try {
      const attachment = await uploadAttachment(ticketId, req.user!.id, req.file)
      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      })
    } catch (serviceErr) {
      // The stored file has no surviving Attachment row — remove it so
      // disk usage doesn't grow with every rejected upload.
      fs.unlink(path.join(req.file.destination, req.file.filename), () => {})

      if (serviceErr instanceof TicketNotFoundError) {
        res.status(404).json({ error: serviceErr.message })
        return
      }
      if (serviceErr instanceof TicketFinishedError) {
        sendTicketFinished(res)
        return
      }
      if (serviceErr instanceof AttachmentLimitReachedError) {
        res.status(400).json({ error: serviceErr.message })
        return
      }
      console.error('POST /api/tickets/:id/attachments failed', serviceErr)
      res.status(500).json({ error: 'Unable to upload attachment' })
    }
  })
})

// Any role may ask (specification.md §5.3); what the caller reaches is
// decided by the lookup. A Requester reaches their own Tickets' Attachments.
router.get('/attachments/:id/download', async (req: SessionRequest, res) => {
  const attachmentId = Number(req.params.id)
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    res.status(404).json({ error: 'Attachment not found' })
    return
  }

  try {
    const attachment = await getDownloadableAttachment(attachmentId, req.user!.id)
    res.download(path.join(UPLOAD_DIR, attachment.storedFilename), attachment.originalFilename, (err) => {
      if (err) {
        console.error('GET /api/attachments/:id/download failed', err)
        // res.download only invokes this callback on failure and never
        // itself writes a response — without an explicit response here the
        // client hangs (e.g. the stored file is missing from disk) instead
        // of getting a 500.
        if (!res.headersSent) {
          res.status(500).json({ error: 'Unable to download attachment' })
        }
      }
    })
  } catch (serviceErr) {
    if (serviceErr instanceof AttachmentNotFoundError) {
      res.status(404).json({ error: serviceErr.message })
      return
    }
    console.error('GET /api/attachments/:id/download failed', serviceErr)
    res.status(500).json({ error: 'Unable to download attachment' })
  }
})

// Before the body is read or the reason validated (api-spec.md §1.5).
async function refuseFinished(req: SessionRequest, res: Response, next: NextFunction) {
  const attachmentId = rowIdOf(req.params.id)

  if (attachmentId !== null && (await isOwnAttachmentTicketFinished(attachmentId, req.user!.id))) {
    sendTicketFinished(res)
    return
  }

  next()
}

router.post('/attachments/:id/remove', requireRequesterRole, refuseFinished, parseJsonBody, async (req: SessionRequest, res) => {
  const attachmentId = rowIdOf(req.params.id)
  if (attachmentId === null) {
    res.status(404).json({ error: 'Attachment not found' })
    return
  }

  const removalReason = validateRemovalReason(req.body?.removalReason)
  if (!removalReason) {
    res.status(400).json({
      error: 'A removal reason (5-500 characters) is required',
      field: 'removalReason',
    })
    return
  }

  try {
    const attachment = await removeAttachment(attachmentId, req.user!.id, removalReason)
    res.status(200).json({
      id: attachment.id,
      removedAt: attachment.removedAt,
      removedByRequesterId: attachment.removedByRequesterId,
      removalReason: attachment.removalReason,
    })
  } catch (serviceErr) {
    if (serviceErr instanceof AttachmentNotFoundError) {
      res.status(404).json({ error: serviceErr.message })
      return
    }
    if (serviceErr instanceof TicketFinishedError) {
      sendTicketFinished(res)
      return
    }
    console.error('POST /api/attachments/:id/remove failed', serviceErr)
    res.status(500).json({ error: 'Unable to remove attachment' })
  }
})

export default router
