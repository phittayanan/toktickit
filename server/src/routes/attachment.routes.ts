import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { requireRequester, type RequesterRequest } from '../middleware/requireRequester'
import { uploadSingleFile, UnsupportedFileTypeError, UPLOAD_DIR } from '../upload'
import { validateRemovalReason } from '../schemas/attachment.schema'
import {
  uploadAttachment,
  getDownloadableAttachment,
  removeAttachment,
  TicketNotFoundError,
  AttachmentLimitReachedError,
  AttachmentNotFoundError,
} from '../services/attachment.service'

const router = Router()

router.post('/tickets/:id/attachments', requireRequester, (req: RequesterRequest, res) => {
  const ticketId = Number(req.params.id)
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(404).json({ error: 'Ticket not found' })
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
      const attachment = await uploadAttachment(ticketId, req.requesterId!, req.file)
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
      if (serviceErr instanceof AttachmentLimitReachedError) {
        res.status(400).json({ error: serviceErr.message })
        return
      }
      console.error('POST /api/tickets/:id/attachments failed', serviceErr)
      res.status(500).json({ error: 'Unable to upload attachment' })
    }
  })
})

router.get('/attachments/:id/download', requireRequester, async (req: RequesterRequest, res) => {
  const attachmentId = Number(req.params.id)
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    res.status(404).json({ error: 'Attachment not found' })
    return
  }

  try {
    const attachment = await getDownloadableAttachment(attachmentId, req.requesterId!)
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

router.post('/attachments/:id/remove', requireRequester, async (req: RequesterRequest, res) => {
  const attachmentId = Number(req.params.id)
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
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
    const attachment = await removeAttachment(attachmentId, req.requesterId!, removalReason)
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
    console.error('POST /api/attachments/:id/remove failed', serviceErr)
    res.status(500).json({ error: 'Unable to remove attachment' })
  }
})

export default router
