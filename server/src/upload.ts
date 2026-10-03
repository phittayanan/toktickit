import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import multer, { type FileFilterCallback } from 'multer'
import type { Request } from 'express'
import { isAllowedMimeType, MAX_ATTACHMENT_SIZE_BYTES } from './schemas/attachment.schema'

// Local disk storage (specification.md §3) — not cloud/DB-blob. Each stored
// file is named `<uuid>.<ext>` (specification.md §7), independent of the
// Requester-supplied original filename, so a hostile filename can never
// collide with another Attachment or escape the uploads directory.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// Marks a rejected file with a field name so the route handler can map it
// to the api-spec.md `{ error, field: "file" }` shape rather than letting
// multer's own error propagate as a generic 500.
export class UnsupportedFileTypeError extends Error {
  field = 'file'
  constructor() {
    super('Unsupported file type')
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  // BR-13: reject unsupported types before the file is fully written.
  if (!isAllowedMimeType(file.mimetype)) {
    cb(new UnsupportedFileTypeError())
    return
  }
  cb(null, true)
}

// BR-14: multer enforces the 5 MB cap during the streamed write itself,
// so an oversized file never lands on disk in the first place.
export const uploadSingleFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
}).single('file')
