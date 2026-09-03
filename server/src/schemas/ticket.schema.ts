import { z } from 'zod'

// BR-08/BR-09/BR-11: Summary and Description are required, trimmed, and
// length-bounded; Requested Priority is a fixed enum. categoryId/
// relatedSystemId existence-and-active (BR-10) is checked against the DB
// in ticket.service.ts — a schema alone can't see the database.
export const createTicketSchema = z.object({
  categoryId: z.number().int().positive(),
  relatedSystemId: z.number().int().positive(),
  requestedPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string().trim().min(5).max(150),
  description: z.string().trim().min(10).max(5000),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>

const PAGE_SIZES = [10, 25, 50] as const
const SORT_FIELDS = ['createdAt', 'updatedAt', 'ticketNumber'] as const
const SORT_DIRS = ['asc', 'desc'] as const
const STATUSES = ['NEW'] as const

// Query params arrive as strings (or are absent). `withDefault` applies the
// default only when the param is genuinely omitted; a *present* value that
// fails `inner` still surfaces as a 400 (api-spec.md: "an invalid value for
// any of these ... → 400 with field naming the offending parameter") rather
// than silently falling back like zod's `.catch()` would.
function withDefault<T extends z.ZodTypeAny>(inner: T, fallback: z.infer<T>) {
  return z.preprocess((value) => (value === undefined ? fallback : value), inner)
}

// api-spec.md `GET /api/tickets` query contract (BR-22).
export const listTicketsQuerySchema = z.object({
  page: withDefault(z.coerce.number().int().min(1), 1),
  pageSize: withDefault(
    z.coerce.number().refine((value) => (PAGE_SIZES as readonly number[]).includes(value), {
      message: 'pageSize must be 10, 25, or 50',
    }),
    10,
  ),
  // A blank or whitespace-only `search` is treated the same as an omitted
  // one, not a validation failure — trimming happens *before* the emptiness
  // check here (unlike a bare `.trim().min(1)`, which only trims the value
  // it validates, not the raw input a `.or(literal(''))` fallback sees).
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  categoryId: z.coerce.number().int().positive().optional(),
  requestedPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  itPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  currentStatus: z.enum(STATUSES).optional(),
  sortBy: withDefault(z.enum(SORT_FIELDS), 'updatedAt'),
  sortDir: withDefault(z.enum(SORT_DIRS), 'desc'),
})

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>
