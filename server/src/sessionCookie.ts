import type { Request, Response } from 'express'

export const SESSION_COOKIE = 'tk_session'

// api-spec.md §1.2: no Max-Age, so the browser keeps it for its own
// session and the server alone decides expiry.
const ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, ATTRIBUTES)
}

// api-spec.md §1.2: cleared with Max-Age=0.
export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, '', { ...ATTRIBUTES, maxAge: 0 })
}

// The session value the request carries, or undefined.
export function readSessionCookie(req: Request): string | undefined {
  for (const pair of (req.headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=')
    if (separator !== -1 && pair.slice(0, separator).trim() === SESSION_COOKIE) {
      return pair.slice(separator + 1).trim()
    }
  }

  return undefined
}
