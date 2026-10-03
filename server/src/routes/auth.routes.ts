import { Router } from 'express'
import { sendError, sendValidationError } from '../apiError'
import { parseJsonBody } from '../middleware/parseJsonBody'
import { requireSession, type SessionRequest } from '../middleware/requireSession'
import { changePasswordSchema, loginSchema } from '../schemas/auth.schema'
import { changePassword, login, toUserIdentity } from '../services/auth.service'
import { endSession } from '../services/session.service'
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../sessionCookie'

const router = Router()

// api-spec.md §1.6: no authentication response is cached.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

router.post('/login', parseJsonBody, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  const result = await login(parsed.data.email, parsed.data.password)

  if (result.outcome === 'INVALID_CREDENTIALS') {
    sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    return
  }
  if (result.outcome === 'THROTTLED') {
    res.set('Retry-After', String(result.retryAfterSeconds))
    sendError(res, 429, 'LOGIN_THROTTLED', 'Too many failed sign-in attempts. Try again later.')
    return
  }
  if (result.outcome === 'ACCOUNT_INACTIVE') {
    sendError(res, 403, 'ACCOUNT_INACTIVE', 'This account is inactive. Contact an administrator.')
    return
  }

  setSessionCookie(res, result.sessionToken)
  res.status(200).json(toUserIdentity(result.user))
})

router.post('/logout', async (req, res) => {
  const token = readSessionCookie(req)
  if (token) {
    await endSession(token)
  }

  clearSessionCookie(res)
  res.status(204).end()
})

router.get('/me', requireSession, (req: SessionRequest, res) => {
  res.status(200).json(toUserIdentity(req.user!))
})

router.post('/change-password', requireSession, parseJsonBody, async (req: SessionRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  const result = await changePassword(req.user!, parsed.data)
  if (result.outcome === 'REJECTED') {
    sendError(res, 400, 'VALIDATION_ERROR', result.message, result.field)
    return
  }

  setSessionCookie(res, result.sessionToken)
  res.status(200).json(toUserIdentity(result.user))
})

export default router
