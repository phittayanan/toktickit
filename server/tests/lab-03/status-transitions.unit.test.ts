import { describe, it, expect } from 'vitest'
import { TICKET_STATUSES, allowedTransitions, canTransition } from '../../src/services/statusTransitions.service'

// The BR-28 matrix, written out pair by pair from specification.md §5.6.
const PERMITTED = [
  'NEW>OPEN',
  'NEW>CANCELLED',
  'OPEN>IN_PROGRESS',
  'OPEN>WAITING_FOR_REQUESTER',
  'OPEN>CANCELLED',
  'IN_PROGRESS>WAITING_FOR_REQUESTER',
  'IN_PROGRESS>RESOLVED',
  'IN_PROGRESS>CANCELLED',
  'WAITING_FOR_REQUESTER>IN_PROGRESS',
  'WAITING_FOR_REQUESTER>RESOLVED',
  'WAITING_FOR_REQUESTER>CANCELLED',
  'RESOLVED>CLOSED',
  'RESOLVED>REOPENED',
  'REOPENED>IN_PROGRESS',
  'REOPENED>WAITING_FOR_REQUESTER',
  'REOPENED>RESOLVED',
  'REOPENED>CANCELLED',
]

const ALL_PAIRS = TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.map((to) => [from, to] as const))

// UNIT-02 (AC-34): the transition table over all 64 from/to pairs.
describe('status transitions', () => {
  it('covers the eight statuses of BR-27', () => {
    expect([...TICKET_STATUSES].sort()).toEqual([
      'CANCELLED',
      'CLOSED',
      'IN_PROGRESS',
      'NEW',
      'OPEN',
      'REOPENED',
      'RESOLVED',
      'WAITING_FOR_REQUESTER',
    ])
    expect(ALL_PAIRS).toHaveLength(64)
  })

  it.each(ALL_PAIRS)('%s to %s is permitted only if BR-28 says so', (from, to) => {
    expect(canTransition(from, to)).toBe(PERMITTED.includes(`${from}>${to}`))
  })

  it.each(['CLOSED', 'CANCELLED'] as const)('%s permits no transition', (from) => {
    expect(allowedTransitions(from)).toEqual([])
  })

  it('lists the permitted targets of a status', () => {
    expect([...allowedTransitions('IN_PROGRESS')].sort()).toEqual(['CANCELLED', 'RESOLVED', 'WAITING_FOR_REQUESTER'])
  })
})
