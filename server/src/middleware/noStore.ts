import type { Request, Response, NextFunction } from 'express'

// api-spec.md §1.6: the response is never cached.
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set('Cache-Control', 'no-store')
  next()
}
