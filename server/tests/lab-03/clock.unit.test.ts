import { describe, it, expect, afterEach } from 'vitest'
import { now, resetClock } from '../../src/clock'
import { installFakeClock } from './support/clock'

afterEach(() => {
  resetClock()
})

// tests.md §1 Time: one injectable clock, so a test advances the time
// instead of sleeping.
describe('clock', () => {
  it('reads the system time by default', () => {
    const before = Date.now()
    const read = now().getTime()
    const after = Date.now()

    expect(read).toBeGreaterThanOrEqual(before)
    expect(read).toBeLessThanOrEqual(after)
  })

  it('reads the installed time until it is advanced', () => {
    const clock = installFakeClock(new Date('2026-10-01T00:00:00.000Z'))

    expect(now().toISOString()).toBe('2026-10-01T00:00:00.000Z')

    clock.advance(15 * 60 * 1000)

    expect(now().toISOString()).toBe('2026-10-01T00:15:00.000Z')
  })

  it('returns to the system time when reset', () => {
    installFakeClock(new Date('2000-01-01T00:00:00.000Z'))

    resetClock()

    expect(now().getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00.000Z').getTime())
  })
})
