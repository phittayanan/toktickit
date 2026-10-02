import { z } from 'zod'

// BR-35: a Public Comment is trimmed, not empty, and at most 2000
// characters.
export const PUBLIC_COMMENT_MAX_LENGTH = 2000

export const publicCommentSchema = z.object({
  body: z
    .string({ error: 'A comment is required.' })
    .trim()
    .min(1, 'A comment is required.')
    .max(PUBLIC_COMMENT_MAX_LENGTH, `A comment must be at most ${PUBLIC_COMMENT_MAX_LENGTH} characters.`),
})

// BR-35: an Internal Note is trimmed, not empty, and at most 4000
// characters.
export const INTERNAL_NOTE_MAX_LENGTH = 4000

export const internalNoteSchema = z.object({
  body: z
    .string({ error: 'A note is required.' })
    .trim()
    .min(1, 'A note is required.')
    .max(INTERNAL_NOTE_MAX_LENGTH, `A note must be at most ${INTERNAL_NOTE_MAX_LENGTH} characters.`),
})
