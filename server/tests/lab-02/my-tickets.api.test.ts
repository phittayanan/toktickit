import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'

let categoryId: number
let relatedSystemId: number

// Run-unique so re-running the suite against a non-reset dev database
// never collides with a previous run's Ticket Numbers.
const RUN_ID = Date.now()

// Each test gets its own fresh Requester rather than sharing seeded
// ones — that keeps assertions exact (no "some tickets belonging to other
// tests" noise) instead of relying on .some()/.every() against a shared
// growing dataset.
async function seedRequester(label: string) {
  return prisma.user.create({
    data: { name: `my-tickets.api.test — ${label}`, email: `my-tickets-${RUN_ID}-${label}@example.com` },
  })
}

// Creates a Ticket directly via Prisma (bypassing the create-Ticket flow)
// so setup is fast/deterministic — the create endpoint itself is covered
// by create-ticket.api.test.ts.
async function seedTicket(overrides: {
  ticketNumber: string
  requesterId: number
  summary?: string
  requestedPriority?: 'LOW' | 'MEDIUM' | 'HIGH'
}) {
  const requestedPriority = overrides.requestedPriority ?? 'MEDIUM'
  return prisma.ticket.create({
    data: {
      ticketNumber: overrides.ticketNumber,
      requesterId: overrides.requesterId,
      categoryId,
      relatedSystemId,
      summary: overrides.summary ?? 'Default summary for a seeded ticket',
      description: 'A description long enough to satisfy validation, for a seeded ticket.',
      requestedPriority,
      itPriority: requestedPriority,
    },
  })
}

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  categoryId = category.id

  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  relatedSystemId = relatedSystem.id
})

describe('GET /api/tickets', () => {
  // API-11 (AC-19): only the requesting Requester's own Tickets come back
  it("returns only the requesting Requester's own Tickets", async () => {
    const requesterA = await seedRequester('ownership-a')
    const requesterB = await seedRequester('ownership-b')
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}01`, requesterId: requesterA.id })
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}02`, requesterId: requesterB.id })

    const res = await request(app).get('/api/tickets').set('X-Requester-Id', String(requesterA.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].ticketNumber).toBe(`TKT-2026-${RUN_ID}01`)
  })

  // API-12 (AC-20): search matches Ticket Number OR Summary substrings
  it('search matches Ticket Number and Summary substrings', async () => {
    const requester = await seedRequester('search')
    await seedTicket({
      ticketNumber: `TKT-2026-${RUN_ID}10`,
      requesterId: requester.id,
      summary: 'Laptop battery drains quickly',
    })
    await seedTicket({
      ticketNumber: `TKT-2026-${RUN_ID}11`,
      requesterId: requester.id,
      summary: 'Printer is offline',
    })

    const res = await request(app)
      .get('/api/tickets')
      .query({ search: 'laptop' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].summary).toBe('Laptop battery drains quickly')
  })

  it('search matches a Ticket Number case-insensitively', async () => {
    const requester = await seedRequester('search-case')
    const ticketNumber = `TKT-2026-${RUN_ID}12`
    await seedTicket({ ticketNumber, requesterId: requester.id })

    const res = await request(app)
      .get('/api/tickets')
      .query({ search: ticketNumber.toLowerCase() })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('treats a whitespace-only search as omitted rather than rejecting it', async () => {
    const requester = await seedRequester('search-blank')
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}13`, requesterId: requester.id })

    const res = await request(app)
      .get('/api/tickets')
      .query({ search: '   ' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  // API-13 (AC-21): a filter with no matches returns an empty, not an error
  it('returns an empty result set for a filter with no matches', async () => {
    const requester = await seedRequester('no-match')
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}20`, requesterId: requester.id })

    const res = await request(app)
      .get('/api/tickets')
      .query({ categoryId: '999999' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.meta.totalItems).toBe(0)
  })

  // API-14 (AC-22): sortBy/sortDir combinations work
  it('sorts by ticketNumber ascending', async () => {
    const requester = await seedRequester('sort')
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}31`, requesterId: requester.id })
    await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}30`, requesterId: requester.id })

    const res = await request(app)
      .get('/api/tickets')
      .query({ sortBy: 'ticketNumber', sortDir: 'asc' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      `TKT-2026-${RUN_ID}30`,
      `TKT-2026-${RUN_ID}31`,
    ])
  })

  it('defaults to sorting by Last Updated descending', async () => {
    const requester = await seedRequester('default-sort')
    const older = await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}40`, requesterId: requester.id })
    const newer = await seedTicket({ ticketNumber: `TKT-2026-${RUN_ID}41`, requesterId: requester.id })
    // Force a distinguishable updatedAt ordering opposite of insertion order.
    await prisma.ticket.update({
      where: { id: older.id },
      data: { updatedAt: new Date(Date.now() + 60_000) },
    })

    const res = await request(app).get('/api/tickets').set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(200)
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([older.id, newer.id])
  })

  // API-15 (AC-23): pagination respects page/pageSize and returns correct meta
  it('paginates correctly across two pages', async () => {
    const requester = await seedRequester('pagination')

    for (let i = 0; i < 15; i++) {
      await seedTicket({
        ticketNumber: `TKT-2026-${RUN_ID}5${String(i).padStart(2, '0')}`,
        requesterId: requester.id,
      })
    }

    const page1 = await request(app)
      .get('/api/tickets')
      .query({ page: '1', pageSize: '10' })
      .set('X-Requester-Id', String(requester.id))
    const page2 = await request(app)
      .get('/api/tickets')
      .query({ page: '2', pageSize: '10' })
      .set('X-Requester-Id', String(requester.id))

    expect(page1.status).toBe(200)
    expect(page1.body.data).toHaveLength(10)
    expect(page1.body.meta).toEqual({ page: 1, pageSize: 10, totalItems: 15, totalPages: 2 })

    expect(page2.status).toBe(200)
    expect(page2.body.data).toHaveLength(5)
    expect(page2.body.meta.totalPages).toBe(2)
  })

  // API-16: an out-of-range pageSize is a field-specific 400
  it('rejects an invalid pageSize with a field-specific 400', async () => {
    const requester = await seedRequester('bad-pagesize')
    const res = await request(app)
      .get('/api/tickets')
      .query({ pageSize: '999' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('pageSize')
  })

  it('rejects an unknown sortBy with a field-specific 400', async () => {
    const requester = await seedRequester('bad-sortby')
    const res = await request(app)
      .get('/api/tickets')
      .query({ sortBy: 'notAField' })
      .set('X-Requester-Id', String(requester.id))

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('sortBy')
  })

  // shared header contract: missing X-Requester-Id rejected 400
  it('rejects a request with no X-Requester-Id header', async () => {
    const res = await request(app).get('/api/tickets')

    expect(res.status).toBe(400)
  })
})
