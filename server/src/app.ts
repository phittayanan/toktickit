import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { sendError } from './apiError'
import { CLIENT_ORIGIN, requireAllowedOrigin } from './middleware/requireAllowedOrigin'
import { requireRole } from './middleware/requireRole'
import { requirePasswordChanged, requireSession } from './middleware/requireSession'
import referenceDataRoutes from './routes/referenceData.routes'
import ticketRoutes from './routes/ticket.routes'
import attachmentRoutes from './routes/attachment.routes'
import commentRoutes from './routes/comment.routes'
import authRoutes from './routes/auth.routes'
import adminRoutes from './routes/admin.routes'
import { noStore } from './middleware/noStore'
import staffRoutes from './routes/staff.routes'

const app = express()

// api-spec.md §1.1: exactly one origin, with credentials, so the browser
// sends the session cookie to it and to nothing else.
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(requireAllowedOrigin)

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

app.use('/api/auth', authRoutes)

// api-spec.md §1.6: no User Management response is cached, a refusal
// included.
app.use('/api/admin', noStore)

// api-spec.md §1.5 steps 1 and 2: everything below needs a session whose
// user has no password change pending.
app.use('/api', requireSession, requirePasswordChanged)

// Step 3 where the role is fixed by prefix, so it holds for every path
// under it, defined or not (api-spec.md §1.4).
app.use('/api/staff', requireRole('IT_STAFF', 'ADMINISTRATOR'))
app.use('/api/admin', requireRole('ADMINISTRATOR'))

app.use('/api', referenceDataRoutes)
app.use('/api', ticketRoutes)
app.use('/api', attachmentRoutes)
app.use('/api', commentRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/staff', staffRoutes)

// api-spec.md §1.4: an /api path, or a method, that nothing above defines
// is answered after the session checks, so it says nothing to a visitor
// who is not signed in.
app.use('/api', (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found')
})

// BR-49: an unexpected failure answers with the generic body only. The
// error is logged for the operator; a request body is never logged, so no
// password reaches the log (BR-07). The Lab 2 routes catch their own
// failures and keep their Lab 2 bodies.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // An error that names a 4xx status (express.json() refusing a body that
  // is not JSON, too large, or in a charset it does not read; the router
  // refusing a path it cannot decode) is the client's. Whatever status it
  // names, it is answered 400, the one status api-spec.md §1.4 gives
  // VALIDATION_ERROR. Its own text is repeated only when it is marked safe
  // to show.
  const { type, status, expose, message } = (err ?? {}) as Record<string, unknown>
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const error =
      type === 'entity.parse.failed'
        ? 'The request body is not valid JSON.'
        : expose === true
          ? String(message)
          : 'The request is malformed.'
    sendError(res, 400, 'VALIDATION_ERROR', error)
    return
  }

  console.error(`${req.method} ${req.path} failed`, err)
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
})

export default app
