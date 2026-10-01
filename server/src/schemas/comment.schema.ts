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
