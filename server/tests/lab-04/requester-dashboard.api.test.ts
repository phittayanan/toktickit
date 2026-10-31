import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { resetClock } from '../../src/clock'
import { installFakeClock } from '../lab-03/support/clock'
import { signInAs } from '../lab-03/support/signIn'
import { ALL_STATUSES, FIXED_NOW, minutesAfter, referenceIds, ticketRow, WINDOW_START } from './support/dashboardData'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

const OPEN_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const

let reference: Awaited<ReturnType<typeof referenceIds>>

beforeAll(async () => {
  reference = await referenceIds()
})

afterEach(() => {
  resetClock()
})

const getDashboard = (cookie: string) => request(app).get('/api/requester/dashboard').set('Cookie', cookie)

describe('GET /api/requester/dashboard', () => {
  // DASH-01 (AC-26)
  it("returns only the session user's Tickets, whatever the request names", async () => {
    installFakeClock(FIXED_NOW)
    const owner = await signInAs('REQUESTER')
    const other = await signInAs('REQUESTER')
    await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: owner.user.id, currentStatus: 'OPEN', summary: 'mine', updatedAt: FIXED_NOW }),
    })
    await prisma.ticket.createMany({
      data: [
        ticketRow(reference, { requesterId: other.user.id, currentStatus: 'OPEN', summary: 'theirs', updatedAt: FIXED_NOW }),
        ticketRow(reference, { requesterId: other.user.id, currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: FIXED_NOW }),
      ],
    })

    const res = await getDashboard(owner.cookie).query({ requesterId: other.user.id })

    expect(res.status).toBe(200)
    expect(res.body.openCount).toBe(1)
    expect(res.body.waitingForRequesterCount).toBe(0)
    expect(res.body.recentlyUpdated.map((ticket: { summary: string }) => ticket.summary)).toEqual(['mine'])
  })

  // DASH-02 (AC-27)
  it('counts Open Tickets and Waiting for Requester as a direct query does', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    await prisma.ticket.createMany({
      data: ALL_STATUSES.flatMap((currentStatus) => [
        ticketRow(reference, { requesterId: user.id, currentStatus }),
        ticketRow(reference, { requesterId: user.id, currentStatus }),
      ]),
    })

    const res = await getDashboard(cookie)

    const direct = await prisma.ticket.count({
      where: { requesterId: user.id, currentStatus: { in: [...OPEN_STATUSES] } },
    })
    expect(res.status).toBe(200)
    expect(res.body.openCount).toBe(direct)
    expect(res.body.openCount).toBe(10)
    expect(res.body.waitingForRequesterCount).toBe(2)
  })

  // DASH-03 (AC-28)
  it('holds the five newest in the window, from its first instant, newest first', async () => {
    installFakeClock(FIXED_NOW)
    const { user, cookie } = await signInAs('REQUESTER')
    const atBoundary = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: user.id, summary: 'boundary', updatedAt: WINDOW_START }),
    })
    await prisma.ticket.create({
      data: ticketRow(reference, {
        requesterId: user.id,
        summary: 'before',
        updatedAt: new Date(WINDOW_START.getTime() - 1),
      }),
    })

    const onlyBoundary = await getDashboard(cookie)
    expect(onlyBoundary.body.recentlyUpdated.map((ticket: { id: number }) => ticket.id)).toEqual([atBoundary.id])

    for (const minutes of [10, 40, 20, 50, 30, 60]) {
      await prisma.ticket.create({
        data: ticketRow(reference, {
          requesterId: user.id,
          summary: `at ${minutes}`,
          updatedAt: minutesAfter(WINDOW_START, minutes),
        }),
      })
    }

    const full = await getDashboard(cookie)

    expect(full.body.recentlyUpdated.map((ticket: { summary: string }) => ticket.summary)).toEqual([
      'at 60',
      'at 50',
      'at 40',
      'at 30',
      'at 20',
    ])
  })

  it('applies the same window and order to Recently resolved, with `id` breaking a tie', async () => {
    installFakeClock(FIXED_NOW)
    const { user, cookie } = await signInAs('REQUESTER')
    const atBoundary = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: user.id, currentStatus: 'RESOLVED', resolvedAt: WINDOW_START }),
    })
    await prisma.ticket.create({
      data: ticketRow(reference, {
        requesterId: user.id,
        currentStatus: 'RESOLVED',
        resolvedAt: new Date(WINDOW_START.getTime() - 1),
      }),
    })
    const tiedAt = minutesAfter(WINDOW_START, 5)
    const first = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: user.id, currentStatus: 'CLOSED', resolvedAt: tiedAt }),
    })
    const second = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: user.id, currentStatus: 'RESOLVED', resolvedAt: tiedAt }),
    })

    const res = await getDashboard(cookie)

    expect(res.body.recentlyResolved.map((ticket: { id: number }) => ticket.id)).toEqual([
      second.id,
      first.id,
      atBoundary.id,
    ])
  })

  // DASH-04 (AC-29)
  it('lists Resolved and Closed Tickets and neither Reopened nor Cancelled ones', async () => {
    installFakeClock(FIXED_NOW)
    const { user, cookie } = await signInAs('REQUESTER')
    const resolvedAt = minutesAfter(WINDOW_START, 30)
    await prisma.ticket.createMany({
      data: (['RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'] as const).map((currentStatus) =>
        ticketRow(reference, { requesterId: user.id, currentStatus, resolvedAt, summary: currentStatus }),
      ),
    })

    const res = await getDashboard(cookie)

    expect(res.body.recentlyResolved.map((ticket: { summary: string }) => ticket.summary).sort()).toEqual([
      'CLOSED',
      'RESOLVED',
    ])
  })

  // DASH-05 (AC-35)
  it('answers 200 with zeros and empty lists for a Requester with no Tickets', async () => {
    const { cookie } = await signInAs('REQUESTER')

    const res = await getDashboard(cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ openCount: 0, waitingForRequesterCount: 0, recentlyUpdated: [], recentlyResolved: [] })
  })

  // DASH-06 (AC-37)
  it('holds only the documented fields, and no description, comment, or note', async () => {
    installFakeClock(FIXED_NOW)
    const { user, cookie } = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')
    const ticket = await prisma.ticket.create({
      data: ticketRow(reference, {
        requesterId: user.id,
        currentStatus: 'RESOLVED',
        resolutionSummary: 'SECRET-RESOLUTION-SUMMARY',
        description: 'SECRET-DESCRIPTION text here',
        resolvedAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }),
    })
    await prisma.publicComment.create({
      data: { ticketId: ticket.id, authorId: staff.user.id, body: 'SECRET-COMMENT' },
    })
    await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: staff.user.id, body: 'SECRET-NOTE' } })

    const res = await getDashboard(cookie)

    expect(Object.keys(res.body).sort()).toEqual([
      'openCount',
      'recentlyResolved',
      'recentlyUpdated',
      'waitingForRequesterCount',
    ])
    expect(res.body.recentlyUpdated).toEqual([
      {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        summary: ticket.summary,
        currentStatus: 'RESOLVED',
        updatedAt: FIXED_NOW.toISOString(),
      },
    ])
    expect(res.body.recentlyResolved).toEqual([
      {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        summary: ticket.summary,
        currentStatus: 'RESOLVED',
        resolvedAt: FIXED_NOW.toISOString(),
      },
    ])
    expect(JSON.stringify(res.body)).not.toContain('SECRET')
  })

  // api-spec.md §1.4: a dashboard is never served stale, a refusal included.
  it('is never cached', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')

    const allowed = await getDashboard(cookie)
    const refused = await getDashboard(staff.cookie)

    expect(allowed.headers['cache-control']).toBe('no-store')
    expect(refused.status).toBe(403)
    expect(refused.headers['cache-control']).toBe('no-store')
  })
})

describe('GET /api/tickets with a list of statuses (api-spec.md §4)', () => {
  it('returns Tickets in any listed status; one value behaves as before', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    await prisma.ticket.createMany({
      data: ALL_STATUSES.map((currentStatus) => ticketRow(reference, { requesterId: user.id, currentStatus })),
    })

    const list = await request(app)
      .get('/api/tickets')
      .query({ currentStatus: OPEN_STATUSES.join(',') })
      .set('Cookie', cookie)
    const single = await request(app).get('/api/tickets').query({ currentStatus: 'CLOSED' }).set('Cookie', cookie)

    expect(list.status).toBe(200)
    expect(list.body.data.map((ticket: { currentStatus: string }) => ticket.currentStatus).sort()).toEqual(
      [...OPEN_STATUSES].sort(),
    )
    expect(single.body.data.map((ticket: { currentStatus: string }) => ticket.currentStatus)).toEqual(['CLOSED'])
  })

  it.each(['NOT_A_STATUS', 'NEW,NOT_A_STATUS', 'NEW,', ''])('refuses %j with the Lab 2 400', async (currentStatus) => {
    const { cookie } = await signInAs('REQUESTER')

    const res = await request(app).get('/api/tickets').query({ currentStatus }).set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('currentStatus')
  })

  it('refuses a repeated parameter, as Lab 2 did', async () => {
    const { cookie } = await signInAs('REQUESTER')

    const res = await request(app).get('/api/tickets?currentStatus=NEW&currentStatus=OPEN').set('Cookie', cookie)

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('currentStatus')
  })
})
