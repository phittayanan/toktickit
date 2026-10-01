export interface Clock {
  now(): Date
}

const systemClock: Clock = { now: () => new Date() }

let current: Clock = systemClock

// The one place the server reads the time for rules that depend on it
// (session expiry BR-13, login throttle BR-12), so a test can replace the
// source instead of sleeping.
export function now(): Date {
  return current.now()
}

export function setClock(clock: Clock): void {
  current = clock
}

export function resetClock(): void {
  current = systemClock
}
