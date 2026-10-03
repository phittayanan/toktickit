import type { Request, Response, NextFunction } from 'express'
import { sendError } from '../apiError'

// api-spec.md §1.1: the one origin the browser client is served from.
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// BR-15: a state-changing request that names another origin is refused
// before anything else. A request with no Origin header comes from a
// non-browser client and is not refused by this rule.
export function requireAllowedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('Origin')

  if (STATE_CHANGING_METHODS.includes(req.method) && origin !== undefined && origin !== CLIENT_ORIGIN) {
    sendError(res, 403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.')
    return
  }

  next()
}
