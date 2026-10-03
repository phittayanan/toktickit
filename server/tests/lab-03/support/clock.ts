import { setClock } from '../../../src/clock'

// Replaces the server clock with one that stands still at `start` until the
// test advances it. Call resetClock() (src/clock) in afterEach.
export function installFakeClock(start: Date) {
  let time = start.getTime()
  setClock({ now: () => new Date(time) })

  return {
    advance(milliseconds: number) {
      time += milliseconds
    },
  }
}
