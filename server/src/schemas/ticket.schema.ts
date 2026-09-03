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
