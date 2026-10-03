import { z } from 'zod'
import { TICKET_STATUSES, type TicketStatus } from '../services/statusTransitions.service'

const PAGE_SIZES = ['10', '25', '50'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
const SORT_FIELDS = ['updatedAt', 'createdAt', 'ticketNumber', 'itPriority'] as const
const SORT_DIRS = ['asc', 'desc'] as const

const isTicketStatus = (value: string) => (TICKET_STATUSES as readonly string[]).includes(value)

// The default applies only when the parameter is absent. A value that is
// present and wrong is rejected, never replaced by the default (BR-44).
function withDefault<T extends z.ZodTypeAny>(inner: T, fallback: z.input<T>) {
  return z.preprocess((value) => (value === undefined ? fallback : value), inner)
}

// A query value is a string; a repeated parameter arrives as an array and
// is rejected here. Digits only, so `1.5`, `-1`, `1e2`, and the empty
// string are not integers, and nothing too large to be one exactly.
const positiveInteger = (name: string) =>
  z
    .string(`${name} must be given once`)
    .regex(/^\d+$/, `${name} must be an integer of 1 or more`)
    .transform(Number)
    .refine((value) => value >= 1 && Number.isSafeInteger(value), `${name} must be an integer of 1 or more`)

// api-spec.md §5.1 `GET /api/staff/tickets` query contract. Unknown
// parameter names are ignored.
export const staffQueueQuerySchema = z.object({
  page: withDefault(positiveInteger('page'), '1'),
  pageSize: withDefault(z.enum(PAGE_SIZES, 'pageSize must be 10, 25, or 50').transform(Number), '10'),
  // Trimmed before anything else; an empty search is the same as none.
  search: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string('search must be given once').max(100, 'search must be at most 100 characters').optional(),
  ),
  status: z
    .string('status must be given once')
    .transform((value) => value.split(','))
    .refine(
      (values): values is TicketStatus[] => values.every((value) => isTicketStatus(value)),
      'status must be one or more Status values, comma-separated',
    )
    .optional(),
  owner: z
    .union([z.enum(['unassigned', 'me']), positiveInteger('owner')], 'owner must be unassigned, me, or a user id')
    .optional(),
  itPriority: z.enum(PRIORITIES, 'itPriority must be LOW, MEDIUM, or HIGH').optional(),
  categoryId: positiveInteger('categoryId').optional(),
  appearsResolved: z
    .enum(['true', 'false'], 'appearsResolved must be true or false')
    .transform((value) => value === 'true')
    .optional(),
  sortBy: withDefault(
    z.enum(SORT_FIELDS, 'sortBy must be updatedAt, createdAt, ticketNumber, or itPriority'),
    'updatedAt',
  ),
  sortDir: withDefault(z.enum(SORT_DIRS, 'sortDir must be asc or desc'), 'desc'),
})

export type StaffQueueQuery = z.infer<typeof staffQueueQuerySchema>
