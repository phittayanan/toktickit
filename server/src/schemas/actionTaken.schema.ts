import { z } from 'zod'
import { now } from '../clock'

const BODY = { error: 'The request body must be a JSON object.' }

const DESCRIPTION_MAX_LENGTH = 2000
const RESULT_MAX_LENGTH = 2000
const FOLLOW_UP_NOTE_MAX_LENGTH = 2000
const ATTACHMENT_NOTES_MAX_LENGTH = 500

// The id columns are 32-bit integers, so a larger number names no user.
const MAX_ID = 2_147_483_647

// BR-04: one message for every id that cannot be an assignee, whether the
// schema or the database (actionTaken.service.ts) finds that out.
export const ASSIGNEE_MESSAGE = 'Performed by must be an active IT Staff or Administrator user.'

const description = z
  .string({ error: 'An action description is required.' })
  .trim()
  .min(1, 'An action description is required.')
  .max(DESCRIPTION_MAX_LENGTH, `An action description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`)

// BR-37: an optional text is trimmed, and left empty it is stored as null.
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text or null.` })
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .nullable()

const emptyToNull = (value: string | null | undefined) => value || null

const result = optionalText('A result', RESULT_MAX_LENGTH)
const followUpNote = optionalText('A follow-up note', FOLLOW_UP_NOTE_MAX_LENGTH)
const attachmentNotes = optionalText('Attachment notes', ATTACHMENT_NOTES_MAX_LENGTH)

const actionAt = z.iso
  .datetime({ offset: true, error: 'The action date and time must be a timestamp with a UTC offset.' })
  .transform((value) => new Date(value))

const assigneeId = z.number(ASSIGNEE_MESSAGE).int(ASSIGNEE_MESSAGE).min(1, ASSIGNEE_MESSAGE).max(MAX_ID, ASSIGNEE_MESSAGE)

const followUpRequired = z.boolean('followUpRequired must be true or false.')

interface Rules {
  status: string
  actionAt?: Date
  result: string | null
  followUpRequired: boolean
  followUpNote: string | null
}

// The rules across fields, for a create and an edit alike. BR-06 reads the
// server clock, so a Done time is judged when the body is checked.
function checkRules(input: Rules, ctx: z.RefinementCtx) {
  const refuse = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message })

  if (input.status === 'DONE' && input.result === null) {
    refuse('result', 'A Done action needs a result.')
  }
  if (input.followUpRequired && input.followUpNote === null) {
    refuse('followUpNote', 'A follow-up note is required when follow-up is required.')
  }
  if (!input.followUpRequired && input.followUpNote !== null) {
    refuse('followUpNote', 'A follow-up note is given only when follow-up is required.')
  }
  if (input.status === 'DONE' && input.actionAt !== undefined && input.actionAt > now()) {
    refuse('actionAt', 'A Done action cannot be dated in the future.')
  }
}

// api-spec.md §1.3 step 5: read on its own, because a repeat of a committed
// create is answered whatever the rest of its body says (BR-14).
export const clientRequestIdSchema = z.object(
  { clientRequestId: z.uuid('clientRequestId must be a UUID.') },
  BODY,
)

// api-spec.md §2.2. An absent `actionAt` or `assigneeId` is the service's to
// fill in: now, under the lock, and the session user. Keys the session, the
// server, and the path own are not read at all (BR-05).
export const createActionTakenSchema = z
  .object(
    {
      status: z.enum(['PLANNED', 'DONE'], 'status must be PLANNED or DONE.'),
      description,
      actionAt: actionAt.optional(),
      assigneeId: assigneeId.optional(),
      result: result.optional().transform(emptyToNull),
      followUpRequired: followUpRequired.default(false),
      followUpNote: followUpNote.optional().transform(emptyToNull),
      attachmentNotes: attachmentNotes.optional().transform(emptyToNull),
    },
    BODY,
  )
  .superRefine(checkRules)

// api-spec.md §2.3: every key is required, so an absent one is not read as
// a value to clear.
export const editActionTakenSchema = z
  .object(
    {
      expectedVersion: z.number('expectedVersion must be a version number.').int().min(1, 'expectedVersion must be a version number.'),
      status: z.enum(['PLANNED', 'DONE', 'CANCELLED'], 'status must be PLANNED, DONE, or CANCELLED.'),
      description,
      actionAt,
      assigneeId,
      result: result.transform(emptyToNull),
      followUpRequired,
      followUpNote: followUpNote.transform(emptyToNull),
      attachmentNotes: attachmentNotes.transform(emptyToNull),
    },
    BODY,
  )
  .superRefine(checkRules)

export type CreateActionTakenInput = z.infer<typeof createActionTakenSchema>
export type EditActionTakenInput = z.infer<typeof editActionTakenSchema>
