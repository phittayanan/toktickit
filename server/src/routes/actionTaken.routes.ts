import { Router, type NextFunction, type Response } from 'express'
import { sendError, sendValidationError } from '../apiError'
import { parseJsonBody } from '../middleware/parseJsonBody'
import type { SessionRequest } from '../middleware/requireSession'
import {
  clientRequestIdSchema,
  createActionTakenSchema,
  editActionTakenSchema,
} from '../schemas/actionTaken.schema'
import {
  ActionTakenChangedError,
  ActionTakenEditForbiddenError,
  ActionTakenFinalError,
  ActionTakenNotFoundError,
  createActionTaken,
  editActionTaken,
  findCreatedActionTaken,
  listActionsTaken,
  requireActionTakenOnTicket,
} from '../services/actionTaken.service'
import { requireReachableTicket } from '../services/publicComment.service'
import { TicketFinishedError, TicketNotFoundError, TicketValidationError } from '../services/ticket.service'
import { rowIdOf } from './rowId'

// docs/lab-04/api-spec.md §2: Actions Taken. Mounted under /api, after the
// session, password-change, and prefix role checks (§1.3), so the write
// routes here are Staff-only by their /staff path. There is no delete route
// (BR-11).
const router = Router()

function sendTicketNotFound(res: Response) {
  sendError(res, 404, 'NOT_FOUND', new TicketNotFoundError().message)
}

// api-spec.md §1.3 step 4, ahead of the body: the Ticket is looked up before
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

// The other half of step 4 of `PUT`.
async function requireActionTaken(req: SessionRequest, res: Response, next: NextFunction) {
  const actionTakenId = rowIdOf(req.params.actionTakenId)

  try {
    if (actionTakenId === null) throw new ActionTakenNotFoundError()
    await requireActionTakenOnTicket(rowIdOf(req.params.id)!, actionTakenId)
  } catch (err) {
    if (err instanceof ActionTakenNotFoundError) {
      sendError(res, 404, 'NOT_FOUND', err.message)
      return
    }
    throw err
  }

  next()
}

// The refusals of the two write routes (api-spec.md §1.2), each with its
// status and `code`. False for an error that is none of them.
function sendOperationError(res: Response, err: unknown): boolean {
  if (err instanceof TicketValidationError) {
    sendError(res, 400, 'VALIDATION_ERROR', err.message, err.field)
  } else if (err instanceof TicketNotFoundError) {
    sendTicketNotFound(res)
  } else if (err instanceof TicketFinishedError) {
    sendError(res, 409, 'TICKET_FINISHED', err.message)
  } else if (err instanceof ActionTakenEditForbiddenError) {
    sendError(res, 403, 'ACTION_TAKEN_EDIT_FORBIDDEN', err.message)
  } else if (err instanceof ActionTakenChangedError) {
    sendError(res, 409, 'ACTION_TAKEN_CHANGED', err.message)
  } else if (err instanceof ActionTakenFinalError) {
    sendError(res, 409, 'ACTION_TAKEN_FINAL', err.message)
  } else {
    return false
  }

  return true
}

router.get('/tickets/:id/actions-taken', requireTicket, async (req: SessionRequest, res) => {
  res.status(200).json(await listActionsTaken(rowIdOf(req.params.id)!, req.user!))
})

router.post('/staff/tickets/:id/actions-taken', requireTicket, parseJsonBody, async (req: SessionRequest, res) => {
  const key = clientRequestIdSchema.safeParse(req.body ?? {})
  if (!key.success) {
    sendValidationError(res, key.error)
    return
  }

  const ticketId = rowIdOf(req.params.id)!
  const { clientRequestId } = key.data
  const existing = await findCreatedActionTaken(ticketId, clientRequestId, req.user!)
  if (existing) {
    res.status(200).json(existing)
    return
  }

  const parsed = createActionTakenSchema.safeParse(req.body)
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    const { actionTaken, created } = await createActionTaken(ticketId, req.user!, clientRequestId, parsed.data)
    res.status(created ? 201 : 200).json(actionTaken)
  } catch (err) {
    if (!sendOperationError(res, err)) throw err
  }
})

router.put(
  '/staff/tickets/:id/actions-taken/:actionTakenId',
  requireTicket,
  requireActionTaken,
  parseJsonBody,
  async (req: SessionRequest, res) => {
    const parsed = editActionTakenSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      sendValidationError(res, parsed.error)
      return
    }

    try {
      res
        .status(200)
        .json(await editActionTaken(rowIdOf(req.params.id)!, rowIdOf(req.params.actionTakenId)!, req.user!, parsed.data))
    } catch (err) {
      if (!sendOperationError(res, err)) throw err
    }
  },
)

export default router
