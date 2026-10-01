import type { Request, Response, NextFunction } from 'express'
import type { User } from '../../generated/prisma/client'
import { sendError } from '../apiError'
import { findSessionUser } from '../services/session.service'
import { readSessionCookie } from '../sessionCookie'

export interface SessionRequest extends Request {
  // Set by requireSession: the signed-in user, as the database has them
  // now (role and activation are never read from the session).
  user?: User
}

// api-spec.md §1.5 step 1: the acting user comes from the session cookie
// and nowhere else (BR-03).
export async function requireSession(req: SessionRequest, res: Response, next: NextFunction) {
  const token = readSessionCookie(req)
  const user = token ? await findSessionUser(token) : null

  if (!token || !user) {
    sendError(res, 401, 'UNAUTHENTICATED', 'You are not signed in.')
    return
  }

  req.user = user
  next()
}

// api-spec.md §1.5 step 2 (BR-02): after requireSession, on every endpoint
// except the current user and change password.
export function requirePasswordChanged(req: SessionRequest, res: Response, next: NextFunction) {
  if (req.user!.mustChangePassword) {
    sendError(res, 403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password to continue.')
    return
  }

  next()
}
