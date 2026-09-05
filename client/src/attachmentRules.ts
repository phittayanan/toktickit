// BR-13/BR-14/BR-15 mirrored client-side (shared by CreateTicket.tsx and
// RequesterTicketDetail.tsx so the two upload surfaces can't drift out of
// sync) — the server independently re-validates (api-spec.md).
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_ACTIVE_ATTACHMENTS = 5

export function validateAttachmentFile(file: File): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return `${file.name}: unsupported file type. Allowed types are JPG, PNG, WEBP, and PDF.`
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `${file.name}: exceeds the 5 MB limit.`
  }
  return null
}
