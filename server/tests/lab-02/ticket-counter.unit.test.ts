import { describe, it, expect, afterEach } from 'vitest'
import prisma from '../../src/prisma'
import { nextTicketNumber } from '../../src/services/ticketNumber.service'

// A year far outside real usage, dedicated to this test, so it never
// collides with API tests that create real Tickets in the current year.
const TEST_YEAR = 9999

afterEach(async () => {
  await prisma.ticketCounter.deleteMany({ where: { year: TEST_YEAR } })
})

// UNIT-01: TicketCounter upsert fires 20 concurrent creates in one year
describe('nextTicketNumber', () => {
  it('assigns 20 unique, contiguous lastNumbers under 20 concurrent calls', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => prisma.$transaction((tx) => nextTicketNumber(tx, TEST_YEAR))),
    )

    const lastNumbers = results
      .map((ticketNumber) => Number(ticketNumber.split('-')[2]))
      .sort((a, b) => a - b)

    expect(new Set(lastNumbers).size).toBe(20)
    expect(lastNumbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))

    for (const ticketNumber of results) {
      expect(ticketNumber).toMatch(new RegExp(`^TKT-${TEST_YEAR}-\\d{6}$`))
    }
  })
})
