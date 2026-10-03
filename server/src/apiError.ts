import type { Response } from 'express'
import type { ZodError } from 'zod'

// The Lab 3 error body (api-spec.md §1.4): a message that is safe to
// display, a machine code, and the field for a single-field validation
// error.
export function sendError(res: Response, status: number, code: string, error: string, field?: string): void {
  res.status(status).json(field === undefined ? { error, code } : { error, code, field })
}

// 400 for the first input a schema rejects, naming it in `field`.
export function sendValidationError(res: Response, error: ZodError): void {
  const issue = error.issues[0]

  sendError(res, 400, 'VALIDATION_ERROR', issue.message, issue.path.length > 0 ? String(issue.path[0]) : undefined)
}
