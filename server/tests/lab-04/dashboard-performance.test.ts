import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { signInAs } from '../lab-03/support/signIn'
import { actionTakenRow, ALL_STATUSES, referenceIds, ticketRow } from './support/dashboardData'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

const TICKET_COUNT = 1000
// AC-50.
const LIMIT_MS = 1000

let ids: number[] = []
let requesterCookie: string
let staffCookie: string
let administratorCookie: string

// PERF-01 (AC-50): the Tickets are spread over the statuses and priorities,
// half of them with the requesting users, so each query has real rows to
// count and sort.
beforeAll(async () => {
  const reference = await referenceIds()
  const requester = await signInAs('REQUESTER')
  const staff = await signInAs('IT_STAFF')
  const administrator = await signInAs('ADMINISTRATOR')
  requesterCookie = requester.cookie
  staffCookie = staff.cookie
  administratorCookie = administrator.cookie

  const created = await prisma.ticket.createManyAndReturn({
    data: Array.from({ length: TICKET_COUNT }, (_, index) =>
      ticketRow(reference, {
        requesterId: requester.user.id,
        currentStatus: ALL_STATUSES[index % ALL_STATUSES.length],
        itPriority: (['LOW', 'MEDIUM', 'HIGH'] as const)[index % 3],
        ownerId: index % 2 === 0 ? staff.user.id : null,
        resolvedAt: new Date(Date.now() - index * 60_000),
      }),
    ),
    select: { id: true },
  })
  ids = created.map((ticket) => ticket.id)
  await prisma.actionTaken.createMany({
    data: ids.slice(0, 100).map((ticketId) =>
      actionTakenRow({ ticketId, assigneeId: staff.user.id, status: 'PLANNED', actionAt: new Date() }),
    ),
  })
})

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ids } } })
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } })
})

describe('dashboards over 1000 Tickets', () => {
  it.each([
    ['/api/requester/dashboard', () => requesterCookie],
    ['/api/staff/dashboard', () => staffCookie],
    ['/api/admin/dashboard', () => administratorCookie],
  ])('%s answers within one second', async (path, cookie) => {
    expect(await prisma.ticket.count()).toBeGreaterThanOrEqual(TICKET_COUNT)
    const started = performance.now()

    const res = await request(app).get(path).set('Cookie', cookie())

    const elapsed = performance.now() - started
    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(LIMIT_MS)
  })
})
