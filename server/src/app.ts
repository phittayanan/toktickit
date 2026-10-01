import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { sendError } from './apiError'
import { CLIENT_ORIGIN, requireAllowedOrigin } from './middleware/requireAllowedOrigin'
import { requirePasswordChanged, requireSession } from './middleware/requireSession'
import referenceDataRoutes from './routes/referenceData.routes'
import ticketRoutes from './routes/ticket.routes'
import attachmentRoutes from './routes/attachment.routes'
import authRoutes from './routes/auth.routes'

const app = express()

// api-spec.md §1.1: exactly one origin, with credentials, so the browser
// sends the session cookie to it and to nothing else.
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(requireAllowedOrigin)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

app.use('/api/auth', authRoutes)
app.use('/api', referenceDataRoutes)
app.use('/api', ticketRoutes)
app.use('/api', attachmentRoutes)

// api-spec.md §1.4: an /api path, or a method, that nothing above defines
// is answered after the session checks, so it says nothing to a visitor
// who is not signed in.
app.use('/api', requireSession, requirePasswordChanged, (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found')
})

// BR-49: an unexpected failure answers with the generic body only. The
// error is logged for the operator; a request body is never logged, so no
// password reaches the log (BR-07). The Lab 2 routes catch their own
// failures and keep their Lab 2 bodies.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // express.json() refused the body (not JSON, too large, a charset it
  // does not read): the client's error, answered with the status it names.
  const { type, status, expose, message } = (err ?? {}) as Record<string, unknown>
  if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
    sendError(res, status, 'VALIDATION_ERROR', type === 'entity.parse.failed' ? 'The request body is not valid JSON.' : String(message))
    return
  }

  console.error(`${req.method} ${req.path} failed`, err)
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
})

export default app
