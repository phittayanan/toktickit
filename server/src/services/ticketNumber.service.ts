import type { Prisma } from '../../generated/prisma/client'

// BR-04: the year is the 4-digit calendar year in Asia/Bangkok (ICT,
// UTC+7) at creation time, independent of the server's own timezone.
function currentBangkokYear(): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(new Date())
  return Number(formatted)
}

// BR-05: a single TicketCounter row per year, incremented via an atomic
// upsert inside the caller's transaction — concurrent creates in the same
// year never collide or skip a number, and the first Ticket of a new year
// never fails for lack of a pre-existing counter row (ADR-0002).
//
// `year` is overridable for tests only; every production call site uses
// the current Bangkok year.
export async function nextTicketNumber(
  tx: Prisma.TransactionClient,
  year: number = currentBangkokYear(),
): Promise<string> {
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "TicketCounter" (year, "lastNumber") VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET "lastNumber" = "TicketCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `
  const lastNumber = rows[0].lastNumber
  return `TKT-${year}-${String(lastNumber).padStart(6, '0')}`
}
