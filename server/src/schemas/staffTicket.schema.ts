import { z } from 'zod'
import { TICKET_STATUSES } from '../services/statusTransitions.service'

const BODY = { error: 'The request body must be a JSON object.' }

// A user id, or null for "nobody". Both keys of the owner request are
// required, so an absent key is not read as null.
const userIdOrNull = (name: string) =>
  z.union([z.number().int(), z.null()], `${name} must be a user id or null.`)

// api-spec.md §5.4 `PUT /api/staff/tickets/:id/owner`.
export const ownerSchema = z.object(
  {
    ownerId: userIdOrNull('ownerId'),
    expectedOwnerId: userIdOrNull('expectedOwnerId'),
  },
  BODY,
)

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

// api-spec.md §5.5 `PUT /api/staff/tickets/:id/it-priority`.
export const itPrioritySchema = z.object(
  { itPriority: z.enum(PRIORITIES, 'itPriority must be LOW, MEDIUM, or HIGH.') },
  BODY,
)

const status = (name: string) => z.enum(TICKET_STATUSES, `${name} must be a Status value.`)

// BR-29: a Resolution Summary is trimmed and 10 to 2000 characters.
export const RESOLUTION_SUMMARY_MIN_LENGTH = 10
export const RESOLUTION_SUMMARY_MAX_LENGTH = 2000

const resolutionSummary = z
  .string({ error: 'A resolution summary is required.' })
  .trim()
  .min(1, 'A resolution summary is required.')
  .min(
    RESOLUTION_SUMMARY_MIN_LENGTH,
    `A resolution summary must be at least ${RESOLUTION_SUMMARY_MIN_LENGTH} characters.`,
  )
  .max(
    RESOLUTION_SUMMARY_MAX_LENGTH,
    `A resolution summary must be at most ${RESOLUTION_SUMMARY_MAX_LENGTH} characters.`,
  )

// api-spec.md §5.6 `POST /api/staff/tickets/:id/status`. A Resolution
// Summary is required when the status asked for is RESOLVED and must be
// absent otherwise; a key that is present, whatever its value, is not
// absent.
export const statusSchema = z
  .object({ status: status('status'), expectedStatus: status('expectedStatus'), resolutionSummary: z.unknown().optional() }, BODY)
  .transform((input, ctx) => {
    const { status, expectedStatus } = input

    if (status !== 'RESOLVED') {
      if (input.resolutionSummary !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['resolutionSummary'],
          message: 'A resolution summary is given only when resolving a ticket.',
        })
        return z.NEVER
      }

      return { status, expectedStatus }
    }

    const parsed = resolutionSummary.safeParse(input.resolutionSummary)
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: ['resolutionSummary'], message: parsed.error.issues[0].message })
      return z.NEVER
    }

    return { status, expectedStatus, resolutionSummary: parsed.data }
  })

export type StatusInput = z.infer<typeof statusSchema>
export type OwnerInput = z.infer<typeof ownerSchema>
