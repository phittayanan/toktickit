import { describe, it, expect, afterEach } from 'vitest'
import { resetClock } from '../../src/clock'
import { NO_FAILURES, afterFailedLogin, refusedUntil, type LoginThrottleState } from '../../src/services/loginThrottle.service'
import { installFakeClock } from './support/clock'

const MINUTE = 60 * 1000
const START = new Date('2026-10-01T00:00:00.000Z')

afterEach(() => {
  resetClock()
})

// Fails `count` logins, `gap` milliseconds apart, the first one now.
function failLogins(clock: { advance(ms: number): void }, state: LoginThrottleState, count: number, gap: number) {
  for (let i = 0; i < count; i += 1) {
    if (i > 0) clock.advance(gap)
    state = afterFailedLogin(state)
  }
  return state
}

// UNIT-04 (AC-07): the BR-12 login throttle arithmetic.
describe('login throttle', () => {
  it('refuses nothing after four failures', () => {
    const clock = installFakeClock(START)

    const state = failLogins(clock, NO_FAILURES, 4, MINUTE)

    expect(refusedUntil(state)).toBeNull()
  })

  it('refuses for 15 minutes from the fifth failure within 15 minutes', () => {
    const clock = installFakeClock(START)

    // Failures at 0, 3, 6, 9, and 12 minutes.
    const state = failLogins(clock, NO_FAILURES, 5, 3 * MINUTE)

    expect(refusedUntil(state)).toEqual(new Date('2026-10-01T00:27:00.000Z'))
  })

  it('does not count a failure older than 15 minutes', () => {
    const clock = installFakeClock(START)

    // Failures at 0, 4, 8, 12, and 16 minutes: the first is out of the
    // window by the fifth.
    const state = failLogins(clock, NO_FAILURES, 5, 4 * MINUTE)

    expect(refusedUntil(state)).toBeNull()
    // The sixth, at 17 minutes, is the fifth within 15 minutes.
    clock.advance(MINUTE)
    expect(refusedUntil(afterFailedLogin(state))).toEqual(new Date('2026-10-01T00:32:00.000Z'))
  })

  it('stops refusing by itself 15 minutes after the fifth failure, and counts no earlier failure', () => {
    const clock = installFakeClock(START)
    // Failures at 0, 1, 2, 3, and 4 minutes: refused until 19 minutes.
    let state = failLogins(clock, NO_FAILURES, 5, MINUTE)

    clock.advance(15 * MINUTE - 1)
    expect(refusedUntil(state)).toEqual(new Date('2026-10-01T00:19:00.000Z'))

    clock.advance(1)
    expect(refusedUntil(state)).toBeNull()

    // Four more failures do not refuse again: the five before no longer count.
    state = failLogins(clock, state, 4, 0)
    expect(refusedUntil(state)).toBeNull()
    expect(refusedUntil(afterFailedLogin(state))).toEqual(new Date('2026-10-01T00:34:00.000Z'))
  })
})
