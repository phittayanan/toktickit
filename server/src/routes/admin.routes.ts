import { Router, type NextFunction, type Request, type Response } from 'express'
import { sendError, sendValidationError } from '../apiError'
import { parseJsonBody } from '../middleware/parseJsonBody'
import type { SessionRequest } from '../middleware/requireSession'
import { adminDashboard } from '../services/dashboard.service'
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from '../schemas/userAdmin.schema'
import { createUser, findUserId, listUsers, setInitialPassword, updateUser } from '../services/userAdmin.service'

// User Management (api-spec.md §7). Mounted under /api/admin, where the
// session, password-change, and Administrator checks have already run.
const router = Router()

// Lab 4 api-spec.md §5.3.
router.get('/dashboard', async (_req, res) => {
  res.status(200).json(await adminDashboard())
})

router.get('/users', async (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  res.status(200).json(await listUsers(parsed.data))
})

function sendEmailTaken(res: Response) {
  sendError(res, 409, 'EMAIL_TAKEN', 'A user with this email already exists.', 'email')
}

router.post('/users', parseJsonBody, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  const result = await createUser(parsed.data)
  if (result.outcome === 'EMAIL_TAKEN') {
    sendEmailTaken(res)
    return
  }

  res.status(201).json({ user: result.user, initialPassword: result.initialPassword })
})

function sendUserNotFound(res: Response) {
  sendError(res, 404, 'NOT_FOUND', 'User not found')
}

// api-spec.md §1.5 step 4: the user a path id names is looked up before a
// body is read or validated (step 5), so an unknown id is a 404 whatever
// the body holds.
async function requireTargetUser(req: Request, res: Response, next: NextFunction) {
  const userId = await findUserId(String(req.params.id))
  if (userId === null) {
    sendUserNotFound(res)
    return
  }

  res.locals.targetUserId = userId
  next()
}

// The refusals of api-spec.md §7.3. `updateUser` reports the first that
// applies, in the order §1.5 gives.
const UPDATE_REFUSALS = {
  NOT_FOUND: sendUserNotFound,
  EMAIL_TAKEN: sendEmailTaken,
  SELF_DEACTIVATION: (res: Response) =>
    sendError(res, 409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account.'),
  LAST_ADMINISTRATOR: (res: Response) =>
    sendError(
      res,
      409,
      'LAST_ADMINISTRATOR',
      'This is the last active administrator. Make another user an administrator first.',
    ),
}

router.patch('/users/:id', requireTargetUser, parseJsonBody, async (req: SessionRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  const result = await updateUser(res.locals.targetUserId, req.user!.id, parsed.data)
  if (result.outcome !== 'UPDATED') {
    UPDATE_REFUSALS[result.outcome](res)
    return
  }

  res.status(200).json({ user: result.user, unassignedTicketCount: result.unassignedTicketCount })
})

// api-spec.md §7.4: no body, so none is read.
router.post('/users/:id/initial-password', requireTargetUser, async (req: SessionRequest, res) => {
  const result = await setInitialPassword(res.locals.targetUserId, req.user!.id)
  if (result.outcome === 'NOT_FOUND') {
    sendUserNotFound(res)
    return
  }
  if (result.outcome === 'SELF_INITIAL_PASSWORD') {
    sendError(res, 409, 'SELF_INITIAL_PASSWORD', 'Use Change Password for your own account.')
    return
  }

  res.status(200).json({ initialPassword: result.initialPassword })
})

export default router
