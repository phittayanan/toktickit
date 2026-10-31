import { Router, type NextFunction, type Response } from 'express'
import { sendError, sendValidationError } from '../apiError'
import { parseJsonBody } from '../middleware/parseJsonBody'
import type { SessionRequest } from '../middleware/requireSession'
import { internalNoteSchema } from '../schemas/comment.schema'
import { staffQueueQuerySchema } from '../schemas/staffQueue.schema'
import { itPrioritySchema, ownerSchema, statusSchema } from '../schemas/staffTicket.schema'
import { listEligibleOwners } from '../services/eligibleOwners.service'
import { createInternalNote, listInternalNotes } from '../services/internalNote.service'
import { listQueue } from '../services/staffQueue.service'
import {
  changeItPriority,
  changeOwner,
  changeStatus,
  DoneActionRequiredError,
  getStaffTicket,
  InvalidTransitionError,
  OwnerChangedError,
  OwnerRequiredError,
  PlannedActionRemainsError,
  StatusChangedError,
  ticketExists,
} from '../services/staffTicket.service'
import { TicketFinishedError, TicketNotFoundError, TicketValidationError } from '../services/ticket.service'
import { rowIdOf } from './rowId'

// api-spec.md §5 Staff Tickets. Mounted under /api/staff, after the
// session, password-change, and staff role checks (§1.5 steps 1 to 3).
const router = Router()

router.get('/tickets', async (req: SessionRequest, res) => {
  const parsed = staffQueueQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  res.status(200).json(await listQueue(parsed.data, req.user!.id))
})

router.get('/eligible-owners', async (_req, res) => {
  res.status(200).json(await listEligibleOwners())
})

// api-spec.md §5: a nonexistent Ticket id, and a malformed one, which names
// no Ticket either.
function sendTicketNotFound(res: Response) {
  sendError(res, 404, 'NOT_FOUND', new TicketNotFoundError().message)
}

router.get('/tickets/:id', async (req, res) => {
  const ticketId = rowIdOf(req.params.id)

  try {
    if (ticketId === null) throw new TicketNotFoundError()
    res.status(200).json(await getStaffTicket(ticketId))
  } catch (err) {
    if (err instanceof TicketNotFoundError) {
      sendTicketNotFound(res)
      return
    }
    throw err
  }
})

// api-spec.md §1.5 step 4, ahead of step 5: the Ticket is looked up before
// the body is read, so a body the server cannot read does not turn a 404
// into a 400.
async function requireTicket(req: SessionRequest, res: Response, next: NextFunction) {
  const ticketId = rowIdOf(req.params.id)

  if (ticketId === null || !(await ticketExists(ticketId))) {
    sendTicketNotFound(res)
    return
  }

  next()
}

// The refusals of the staff ticket operations (api-spec.md §5.4 to §5.7),
// each with its status and `code`. False for an error that is none of them.
function sendOperationError(res: Response, err: unknown): boolean {
  if (err instanceof TicketNotFoundError) {
    sendTicketNotFound(res)
  } else if (err instanceof TicketValidationError) {
    sendError(res, 400, 'VALIDATION_ERROR', err.message, err.field)
  } else if (err instanceof TicketFinishedError) {
    sendError(res, 409, 'TICKET_FINISHED', err.message)
  } else if (err instanceof OwnerChangedError) {
    sendError(res, 409, 'OWNER_CHANGED', err.message)
  } else if (err instanceof StatusChangedError) {
    sendError(res, 409, 'STATUS_CHANGED', err.message)
  } else if (err instanceof InvalidTransitionError) {
    sendError(res, 409, 'INVALID_TRANSITION', err.message)
  } else if (err instanceof OwnerRequiredError) {
    sendError(res, 409, 'OWNER_REQUIRED', err.message)
  } else if (err instanceof DoneActionRequiredError) {
    sendError(res, 409, 'DONE_ACTION_REQUIRED', err.message)
  } else if (err instanceof PlannedActionRemainsError) {
    sendError(res, 409, 'PLANNED_ACTION_REMAINS', err.message)
  } else {
    return false
  }

  return true
}

router.put('/tickets/:id/owner', requireTicket, parseJsonBody, async (req, res) => {
  const parsed = ownerSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    res.status(200).json(await changeOwner(rowIdOf(req.params.id)!, parsed.data))
  } catch (err) {
    if (!sendOperationError(res, err)) throw err
  }
})

router.put('/tickets/:id/it-priority', requireTicket, parseJsonBody, async (req, res) => {
  const parsed = itPrioritySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    res.status(200).json(await changeItPriority(rowIdOf(req.params.id)!, parsed.data.itPriority))
  } catch (err) {
    if (!sendOperationError(res, err)) throw err
  }
})

router.post('/tickets/:id/status', requireTicket, parseJsonBody, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    res.status(200).json(await changeStatus(rowIdOf(req.params.id)!, parsed.data))
  } catch (err) {
    if (!sendOperationError(res, err)) throw err
  }
})

// api-spec.md §5.7 Internal Notes. There is no update or delete route
// (BR-34).
router.get('/tickets/:id/notes', requireTicket, async (req, res) => {
  res.status(200).json(await listInternalNotes(rowIdOf(req.params.id)!))
})

router.post('/tickets/:id/notes', requireTicket, parseJsonBody, async (req: SessionRequest, res) => {
  const parsed = internalNoteSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  try {
    res.status(201).json(await createInternalNote(rowIdOf(req.params.id)!, req.user!, parsed.data.body))
  } catch (err) {
    if (!sendOperationError(res, err)) throw err
  }
})

export default router
