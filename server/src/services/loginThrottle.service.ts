import type { Prisma } from '../../generated/prisma/client'
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

// The state without the failure counted at that time, for a login that
// turned out not to be one.
export function withoutFailedLogin(state: LoginThrottleState, countedAt: Date): LoginThrottleState {
  const index = state.failedAt.findIndex((failure) => failure.getTime() === countedAt.getTime())
  if (index === -1) return state

  const failedAt = state.failedAt.filter((_failure, position) => position !== index)

  return { failedAt, lockedUntil: failedAt.length >= MAX_FAILURES ? state.lockedUntil : null }
}

// One change at a time per email, so logins that arrive together are each
// checked against, and counted on top of, the ones before them.
function withThrottleLock<T>(email: string, change: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`

    return change(tx)
  })
}

export type LoginAttempt = { refusedUntil: Date } | { countedAt: Date }

// The state is kept per normalised email, whether or not it matches a
// user, so an unknown email is throttled identically (BR-12).
//
// A login is counted as a failure before its password is checked, unless
// the email is refused: however many arrive together, no more than five
// passwords are checked. What the check finds then keeps the failure,
// clears them all, or takes this one back.
export function beginLoginAttempt(email: string): Promise<LoginAttempt> {
  return withThrottleLock(email, async (tx) => {
    const state = (await tx.loginThrottle.findUnique({ where: { email } })) ?? NO_FAILURES
    const until = refusedUntil(state)
    if (until) return { refusedUntil: until }

    const next = afterFailedLogin(state)
    await tx.loginThrottle.upsert({ where: { email }, update: next, create: { email, ...next } })

    return { countedAt: next.failedAt[next.failedAt.length - 1] }
  })
}

export async function uncountLoginAttempt(email: string, countedAt: Date): Promise<void> {
  await withThrottleLock(email, async (tx) => {
    const state = await tx.loginThrottle.findUnique({ where: { email } })
    if (!state) return

    await tx.loginThrottle.update({ where: { email }, data: withoutFailedLogin(state, countedAt) })
  })
}

export async function clearFailedLogins(email: string): Promise<void> {
  await withThrottleLock(email, (tx) => tx.loginThrottle.deleteMany({ where: { email } }))
}
