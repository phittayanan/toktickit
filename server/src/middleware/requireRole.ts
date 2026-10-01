import type { Response, NextFunction } from 'express'
import type { Role } from '../../generated/prisma/client'
import { sendError } from '../apiError'
import type { SessionRequest } from './requireSession'

// api-spec.md §1.5 step 3 (ADR-0009): after the session checks and before
// any path id, body, or resource is examined. The role is the one the
// database holds now, as requireSession read it.
export function requireRole(...roles: Role[]) {
  return (req: SessionRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this.')
      return
    }

    next()
  }
}

// specification.md §5.3: the Lab 2 Requester functions are Requester-only
// (BR-17).
export const requireRequesterRole = requireRole('REQUESTER')
