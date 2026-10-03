import { Router, type NextFunction, type Response } from 'express'
import { sendError, sendValidationError } from '../apiError'
import { parseJsonBody } from '../middleware/parseJsonBody'
import type { SessionRequest } from '../middleware/requireSession'
import { publicCommentSchema } from '../schemas/comment.schema'
import { createPublicComment, listPublicComments, requireReachableTicket } from '../services/publicComment.service'
import { TicketFinishedError, TicketNotFoundError } from '../services/ticket.service'
import { rowIdOf } from './rowId'

// docs/lab-03/api-spec.md §6.1: Public Comments, for the Ticket's Requester
// and for Staff. There is no update or delete route (BR-34).
const router = Router()

function sendTicketNotFound(res: Response) {
  sendError(res, 404, 'NOT_FOUND', 'Ticket not found')
}

// api-spec.md §1.5 step 4, ahead of step 5: the Ticket is looked up before
// the body is read, so a body the server cannot read does not turn a 404
// into a 400.
async function requireTicket(req: SessionRequest, res: Response, next: NextFunction) {
  const ticketId = rowIdOf(req.params.id)

  try {
    if (ticketId === null) throw new TicketNotFoundError()
    await requireReachableTicket(ticketId, req.user!)
  } catch (err) {
    if (err instanceof TicketNotFoundError) {
      sendTicketNotFound(res)
      return
    }
    throw err
  }

  next()
}

router.get('/tickets/:id/comments', requireTicket, async (req: SessionRequest, res) => {
  res.status(200).json(await listPublicComments(rowIdOf(req.params.id)!, req.user!))
})

router.post('/tickets/:id/comments', requireTicket, parseJsonBody, async (req: SessionRequest, res) => {
  const parsed = publicCommentSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    res.status(201).json(await createPublicComment(rowIdOf(req.params.id)!, req.user!, parsed.data.body))
  } catch (err) {
    if (err instanceof TicketFinishedError) {
      sendError(res, 409, 'TICKET_FINISHED', err.message)
      return
    }
    throw err
  }
})

export default router
