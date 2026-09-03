// BR-13/BR-14: only these MIME types are accepted, and only up to this
// size — both enforced by multer (fileFilter + limits) before the file
// ever reaches the attachment service, and again here so the service can
// be unit-tested without going through multer.
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB (BR-14)

export const MAX_ACTIVE_ATTACHMENTS_PER_TICKET = 5 // BR-15

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType)
}
