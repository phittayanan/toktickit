import type { Request, Response, NextFunction } from 'express'
import prisma from '../prisma'

export interface RequesterRequest extends Request {
  requesterId?: number
}

const HEADER_ERROR = { error: 'A valid X-Requester-Id header is required' }

// BR-06/BR-07/BR-23: every route (except GET /api/requesters) derives the
// acting Requester from X-Requester-Id, never the request body. Missing,
// non-numeric, or unresolvable to an active RequesterUser -> 400. An
// inactive-but-existing id is treated the same as unresolvable.
export async function requireRequester(req: RequesterRequest, res: Response, next: NextFunction) {
  const header = req.header('X-Requester-Id')
  const id = header ? Number(header) : NaN

  if (!header || !Number.isInteger(id) || id <= 0) {
    res.status(400).json(HEADER_ERROR)
    return
  }

  const requester = await prisma.requesterUser.findUnique({ where: { id } })
  if (!requester || !requester.isActive) {
    res.status(400).json(HEADER_ERROR)
    return
  }

  req.requesterId = id
  next()
}
