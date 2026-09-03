import { describe, it, expect } from 'vitest'
import { createTicketSchema } from '../../src/schemas/ticket.schema'

const VALID_INPUT = {
  categoryId: 1,
  relatedSystemId: 1,
  requestedPriority: 'MEDIUM',
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
}

// UNIT-02: zod schema rejects Summary/Description outside 5-150/10-5000 chars
describe('createTicketSchema', () => {
  it('accepts a valid payload', () => {
    const result = createTicketSchema.safeParse(VALID_INPUT)
    expect(result.success).toBe(true)
  })

  it.each([
    ['too short (4 chars)', 'Lapt'],
    ['too long (151 chars)', 'A'.repeat(151)],
  ])('rejects a Summary that is %s', (_label, summary) => {
    const result = createTicketSchema.safeParse({ ...VALID_INPUT, summary })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['summary'])
    }
  })

  it.each([
    ['too short (9 chars)', 'Too short'],
    ['too long (5001 chars)', 'A'.repeat(5001)],
  ])('rejects a Description that is %s', (_label, description) => {
    const result = createTicketSchema.safeParse({ ...VALID_INPUT, description })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['description'])
    }
  })

  it('rejects a missing/blank Summary', () => {
    const result = createTicketSchema.safeParse({ ...VALID_INPUT, summary: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid requestedPriority value', () => {
    const result = createTicketSchema.safeParse({ ...VALID_INPUT, requestedPriority: 'URGENT' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['requestedPriority'])
    }
  })

  it('rejects a non-positive-integer categoryId', () => {
    const result = createTicketSchema.safeParse({ ...VALID_INPUT, categoryId: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['categoryId'])
    }
  })
})
