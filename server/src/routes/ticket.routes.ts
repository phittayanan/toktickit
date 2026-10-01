import { Router, type Response } from 'express'
import { parseJsonBody } from '../middleware/parseJsonBody'
import { requireRequesterRole } from '../middleware/requireRole'
import type { SessionRequest } from '../middleware/requireSession'
import { createTicketSchema, listTicketsQuerySchema } from '../schemas/ticket.schema'
import { sendError } from '../apiError'
import {
  createTicket,
  getTicketById,
  IndicationNotAvailableError,
  listTickets,
  setResolutionIndication,
  TicketFinishedError,
  TicketNotFoundError,
  TicketValidationError,
} from '../services/ticket.service'

const router = Router()

router.post('/tickets', requireRequesterRole, parseJsonBody, async (req: SessionRequest, res) => {
  const parsed = createTicketSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    res.status(400).json({ error: issue.message, field: String(issue.path[0]) })
    return
  }

  try {
    const ticket = await createTicket(parsed.data, req.user!.id)
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

router.get('/tickets', requireRequesterRole, async (req: SessionRequest, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    res.status(400).json({ error: issue.message, field: String(issue.path[0]) })
    return
  }

  try {
    const result = await listTickets(parsed.data, req.user!.id)
    res.status(200).json(result)
  } catch (err) {
    console.error('GET /api/tickets failed', err)
    res.status(500).json({ error: 'Unable to retrieve tickets' })
  }
})

router.get('/tickets/:id', requireRequesterRole, async (req: SessionRequest, res) => {
  const ticketId = Number(req.params.id)
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    // A malformed id can never resolve to a row — same 404 shape as a
    // well-formed-but-missing/not-owned one (ADR-0004).
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  try {
    const ticket = await getTicketById(ticketId, req.user!.id)
    res.status(200).json(ticket)
  } catch (err) {
    if (err instanceof TicketNotFoundError) {
      res.status(404).json({ error: err.message })
      return
    }
    console.error('GET /api/tickets/:id failed', err)
    res.status(500).json({ error: 'Unable to retrieve ticket' })
  }
})

// docs/lab-03/api-spec.md §4.2 and §4.3: Problem Appears Resolved, set by
// PUT and withdrawn by DELETE. Neither takes a body.
function resolutionIndication(indicated: boolean) {
  return async (req: SessionRequest, res: Response) => {
    const ticketId = Number(req.params.id)
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      res.status(404).json({ error: 'Ticket not found' })
      return
    }

    try {
      res.status(200).json(await setResolutionIndication(ticketId, req.user!.id, indicated))
    } catch (err) {
      if (err instanceof TicketNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      if (err instanceof TicketFinishedError) {
        sendError(res, 409, 'TICKET_FINISHED', err.message)
        return
      }
      if (err instanceof IndicationNotAvailableError) {
        sendError(res, 409, 'INDICATION_NOT_AVAILABLE', err.message)
        return
      }
      // Anything else is the application's generic 500 (BR-49).
      throw err
    }
  }
}

router.put('/tickets/:id/resolution-indication', requireRequesterRole, resolutionIndication(true))
router.delete('/tickets/:id/resolution-indication', requireRequesterRole, resolutionIndication(false))

export default router
