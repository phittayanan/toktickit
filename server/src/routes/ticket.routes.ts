import { Router } from 'express'
import { requireRequester, type RequesterRequest } from '../middleware/requireRequester'
import { createTicketSchema, listTicketsQuerySchema } from '../schemas/ticket.schema'
import { createTicket, listTickets, TicketValidationError } from '../services/ticket.service'

const router = Router()

router.post('/tickets', requireRequester, async (req: RequesterRequest, res) => {
  const parsed = createTicketSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    res.status(400).json({ error: issue.message, field: String(issue.path[0]) })
    return
  }

  try {
    const ticket = await createTicket(parsed.data, req.requesterId!)
    res.status(201).json(ticket)
  } catch (err) {
    if (err instanceof TicketValidationError) {
      res.status(400).json({ error: err.message, field: err.field })
      return
    }
    console.error('POST /api/tickets failed', err)
    res.status(500).json({ error: 'Unable to create ticket' })
  }
})

router.get('/tickets', requireRequester, async (req: RequesterRequest, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    res.status(400).json({ error: issue.message, field: String(issue.path[0]) })
    return
  }

  try {
    const result = await listTickets(parsed.data, req.requesterId!)
    res.status(200).json(result)
  } catch (err) {
    console.error('GET /api/tickets failed', err)
    res.status(500).json({ error: 'Unable to retrieve tickets' })
  }
})

export default router
