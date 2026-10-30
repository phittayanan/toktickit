import { describe, it, expect } from 'vitest'
import { recentWindowStart } from '../../src/services/dashboardWindow'

describe('recent window (BR-28)', () => {
  // UNIT-01 (AC-28): Bangkok is UTC+7, so its midnight is 17:00 UTC the day
  // before.
  it('starts at 00:00 Bangkok six calendar days before today', () => {
    expect(recentWindowStart(new Date('2026-10-30T05:00:00.000Z'))).toEqual(new Date('2026-10-23T17:00:00.000Z'))
  })

  it('still counts from the old Bangkok date at 23:59', () => {
    expect(recentWindowStart(new Date('2026-10-30T16:59:59.999Z'))).toEqual(new Date('2026-10-23T17:00:00.000Z'))
  })

  it('moves on one day at 00:00 Bangkok, while UTC is still on the previous date', () => {
    expect(recentWindowStart(new Date('2026-10-30T17:00:00.000Z'))).toEqual(new Date('2026-10-24T17:00:00.000Z'))
  })

  it('crosses a month end', () => {
    expect(recentWindowStart(new Date('2026-03-03T05:00:00.000Z'))).toEqual(new Date('2026-02-24T17:00:00.000Z'))
  })

  it('crosses a year end', () => {
    expect(recentWindowStart(new Date('2027-01-02T05:00:00.000Z'))).toEqual(new Date('2026-12-26T17:00:00.000Z'))
  })
})
