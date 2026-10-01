import { now } from '../clock'
import prisma from '../prisma'

// What is remembered about one email's failed logins (BR-12).
export interface LoginThrottleState {
  failedAt: Date[]
  lockedUntil: Date | null
}

export const NO_FAILURES: LoginThrottleState = { failedAt: [], lockedUntil: null }

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const REFUSAL_MS = 15 * 60 * 1000

// When the refusal of this email ends, or null when it is not refused.
export function refusedUntil(state: LoginThrottleState): Date | null {
  return state.lockedUntil !== null && now() < state.lockedUntil ? state.lockedUntil : null
}

// The state after one more failed login, now.
export function afterFailedLogin(state: LoginThrottleState): LoginThrottleState {
  const time = now().getTime()
  // Only failures in the 15 minutes before now count, and none from
  // before a refusal that has ended.
  const refusalEnded = state.lockedUntil !== null && refusedUntil(state) === null
  const recent = refusalEnded ? [] : state.failedAt.filter((failure) => failure.getTime() > time - WINDOW_MS)
  const failedAt = [...recent, new Date(time)]
  const lockedUntil = failedAt.length >= MAX_FAILURES ? new Date(time + REFUSAL_MS) : null

  return { failedAt, lockedUntil }
}

// The state is kept per normalised email, whether or not it matches a
// user, so an unknown email is throttled identically (BR-12).
export async function loginRefusedUntil(email: string): Promise<Date | null> {
  const state = await prisma.loginThrottle.findUnique({ where: { email } })

  return state ? refusedUntil(state) : null
}

export async function recordFailedLogin(email: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // One failure at a time per email, so failures that arrive together
    // are all counted instead of overwriting each other.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`

    const state = (await tx.loginThrottle.findUnique({ where: { email } })) ?? NO_FAILURES
    const next = afterFailedLogin(state)

    await tx.loginThrottle.upsert({ where: { email }, update: next, create: { email, ...next } })
  })
}

export async function clearFailedLogins(email: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { email } })
}
