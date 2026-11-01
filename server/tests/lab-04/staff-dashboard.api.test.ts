import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { resetClock } from '../../src/clock'
import { installFakeClock } from '../lab-03/support/clock'
import { signInAs, type TestUser } from '../lab-03/support/signIn'
import { applicationOn, createThrowawayDatabase, prismaCli } from '../lab-03/support/throwawayDatabase'
import {
  actionTakenRow,
  ALL_STATUSES,
  FIXED_NOW,
  freshWindow,
  minutesAfter,
  referenceIds,
  ticketRow,
  WINDOW_START,
} from './support/dashboardData'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

interface Person {
  user: TestUser
  cookie: string
}

const UNFINISHED = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'REOPENED'] as const
const SECRET = 'SECRET'

let reference: Awaited<ReturnType<typeof referenceIds>>
let requester: Person
let staff: Person
let otherStaff: Person
let administrator: Person

beforeAll(async () => {
  reference = await referenceIds()
  requester = await signInAs('REQUESTER')
  staff = await signInAs('IT_STAFF')
  otherStaff = await signInAs('IT_STAFF')
  administrator = await signInAs('ADMINISTRATOR')
})

afterEach(() => {
  resetClock()
})

const getStaffDashboard = (cookie: string) => request(app).get('/api/staff/dashboard').set('Cookie', cookie)
const getAdminDashboard = (cookie: string) => request(app).get('/api/admin/dashboard').set('Cookie', cookie)

// The rest of the suite shares this database, so a test measures what it
// added: the same counts before and after its rows.
async function delta(act: () => Promise<void>, cookie = staff.cookie) {
  const before = (await getStaffDashboard(cookie)).body
  await act()
  const after = (await getStaffDashboard(cookie)).body

  return { before, after }
}

describe('GET /api/staff/dashboard', () => {
  // DASH-07 (AC-30)
  it('counts Unassigned, Owned by me, status, and IT Priority as direct queries do', async () => {
    await prisma.ticket.createMany({
      data: ALL_STATUSES.flatMap((currentStatus) => [
        ticketRow(reference, { requesterId: requester.user.id, currentStatus, itPriority: 'HIGH' }),
        ticketRow(reference, {
          requesterId: requester.user.id,
          currentStatus,
          itPriority: 'MEDIUM',
          ownerId: staff.user.id,
        }),
        ticketRow(reference, {
          requesterId: requester.user.id,
          currentStatus,
          itPriority: 'LOW',
          ownerId: otherStaff.user.id,
        }),
      ]),
    })

    const res = await getStaffDashboard(staff.cookie)

    const unfinished = { currentStatus: { in: [...UNFINISHED] } }
    expect(res.status).toBe(200)
    expect(res.body.unassignedCount).toBe(await prisma.ticket.count({ where: { ...unfinished, ownerId: null } }))
    expect(res.body.ownedByMeCount).toBe(6)
    expect(res.body.ownedByMeCount).toBe(
      await prisma.ticket.count({ where: { ...unfinished, ownerId: staff.user.id } }),
    )
    expect(Object.keys(res.body.byStatus).sort()).toEqual([...UNFINISHED].sort())
    for (const currentStatus of UNFINISHED) {
      expect(res.body.byStatus[currentStatus], currentStatus).toBe(await prisma.ticket.count({ where: { currentStatus } }))
    }
    expect(Object.keys(res.body.byItPriority).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM'])
    for (const itPriority of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      expect(res.body.byItPriority[itPriority], itPriority).toBe(
        await prisma.ticket.count({ where: { ...unfinished, itPriority } }),
      )
    }
  })

  it('moves no count when a Finished Ticket is added', async () => {
    const { before, after } = await delta(async () => {
      await prisma.ticket.createMany({
        data: (['CLOSED', 'CANCELLED'] as const).map((currentStatus) =>
          ticketRow(reference, { requesterId: requester.user.id, currentStatus, ownerId: staff.user.id, itPriority: 'HIGH' }),
        ),
      })
      await prisma.ticket.create({
        data: ticketRow(reference, { requesterId: requester.user.id, currentStatus: 'CLOSED' }),
      })
    })

    expect(after.unassignedCount).toBe(before.unassignedCount)
    expect(after.ownedByMeCount).toBe(before.ownedByMeCount)
    expect(after.byStatus).toEqual(before.byStatus)
    expect(after.byItPriority).toEqual(before.byItPriority)
  })

  // DASH-08 (AC-31)
  it("lists only the session user's Planned ones on Unfinished Tickets, soonest first, five with the true count", async () => {
    const assignee = await signInAs('IT_STAFF')
    const unfinished = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: requester.user.id, currentStatus: 'IN_PROGRESS' }),
    })
    const otherUnfinished = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: requester.user.id, currentStatus: 'REOPENED' }),
    })
    const finished = await prisma.ticket.create({
      data: ticketRow(reference, { requesterId: requester.user.id, currentStatus: 'CLOSED' }),
    })
    const assigneeId = assignee.user.id
    const at = (minutes: number) => minutesAfter(FIXED_NOW, minutes)

    await prisma.actionTaken.createMany({
      data: [
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'PLANNED', actionAt: at(50), description: 'a50' }),
        actionTakenRow({ ticketId: otherUnfinished.id, assigneeId, status: 'PLANNED', actionAt: at(10), description: 'a10' }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'PLANNED', actionAt: at(40), description: 'a40' }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'PLANNED', actionAt: at(20), description: 'a20' }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'PLANNED', actionAt: at(60), description: 'a60' }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'PLANNED', actionAt: at(30), description: 'a30' }),
        // None of these is the session user's Planned one on an Unfinished Ticket.
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'DONE', actionAt: at(1) }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId, status: 'CANCELLED', actionAt: at(2) }),
        actionTakenRow({ ticketId: finished.id, assigneeId, status: 'PLANNED', actionAt: at(3) }),
        actionTakenRow({ ticketId: unfinished.id, assigneeId: staff.user.id, status: 'PLANNED', actionAt: at(4) }),
      ],
    })

    const res = await getStaffDashboard(assignee.cookie)

    expect(res.body.myPlannedActionsTakenCount).toBe(6)
    expect(res.body.myPlannedActionsTaken.map((item: { description: string }) => item.description)).toEqual([
      'a10',
      'a20',
      'a30',
      'a40',
      'a50',
    ])
    const first = await prisma.actionTaken.findFirstOrThrow({
      where: { ticketId: otherUnfinished.id, description: 'a10' },
    })
    expect(res.body.myPlannedActionsTaken[0]).toEqual({
      id: first.id,
      ticketId: otherUnfinished.id,
      ticketNumber: otherUnfinished.ticketNumber,
      description: 'a10',
      actionAt: at(10).toISOString(),
    })
  })

  // DASH-09 (AC-32)
  it('holds Unfinished High then Medium Tickets in Urgent, five at most', async () => {
    const summary = `urgent-${Date.now()}`
    const at = (minutes: number) => minutesAfter(FIXED_NOW, minutes)
    const row = (name: string, fields: Partial<Parameters<typeof ticketRow>[1]>) =>
      ticketRow(reference, { requesterId: requester.user.id, summary: `${summary} ${name}`, ...fields })
    await prisma.ticket.createMany({
      data: [
        row('medium-newest', { currentStatus: 'OPEN', itPriority: 'MEDIUM', updatedAt: at(100) }),
        row('high-older', { currentStatus: 'OPEN', itPriority: 'HIGH', updatedAt: at(10) }),
        row('high-newer', { currentStatus: 'NEW', itPriority: 'HIGH', updatedAt: at(20) }),
        row('medium-older', { currentStatus: 'OPEN', itPriority: 'MEDIUM', updatedAt: at(5) }),
        row('low', { currentStatus: 'OPEN', itPriority: 'LOW', updatedAt: at(200) }),
        row('finished', { currentStatus: 'CLOSED', itPriority: 'HIGH', updatedAt: at(300) }),
      ],
    })

    const res = await getStaffDashboard(staff.cookie)

    expect(res.body.urgent).toHaveLength(5)
    const urgent = res.body.urgent as { summary: string; currentStatus: string; itPriority: string }[]
    const priorities = urgent.map((ticket) => ticket.itPriority)
    expect(priorities).toEqual([...priorities].sort((a, b) => (a === b ? 0 : a === 'HIGH' ? -1 : 1)))
    expect(urgent.every((ticket) => ['HIGH', 'MEDIUM'].includes(ticket.itPriority))).toBe(true)
    expect(urgent.every((ticket) => (UNFINISHED as readonly string[]).includes(ticket.currentStatus))).toBe(true)

    const direct = await prisma.ticket.findMany({
      where: { currentStatus: { in: [...UNFINISHED] }, itPriority: { in: ['HIGH', 'MEDIUM'] } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })
    const expected = [
      ...direct.filter((ticket) => ticket.itPriority === 'HIGH'),
      ...direct.filter((ticket) => ticket.itPriority === 'MEDIUM'),
    ].slice(0, 5)
    expect(urgent.map((ticket) => ticket.summary)).toEqual(expected.map((ticket) => ticket.summary))
  })

  it('puts a Medium Ticket after every High one, however recent', async () => {
    const summary = `medium-${Date.now()}`
    const { before, after } = await delta(async () => {
      await prisma.ticket.create({
        data: ticketRow(reference, {
          requesterId: requester.user.id,
          currentStatus: 'OPEN',
          itPriority: 'MEDIUM',
          summary,
          updatedAt: minutesAfter(FIXED_NOW, 10_000),
        }),
      })
    })
    const highCount = before.urgent.filter((t: { itPriority: string }) => t.itPriority === 'HIGH').length

    expect(after.urgent.findIndex((t: { summary: string }) => t.summary === summary)).toBe(
      highCount >= 5 ? -1 : highCount,
    )
  })

  it('includes Finished Tickets in Recently updated, from the first instant of the window, five at most', async () => {
    const { now, start } = freshWindow()
    installFakeClock(now)
    const reader = await signInAs('IT_STAFF')
    const row = (summary: string, currentStatus: (typeof ALL_STATUSES)[number], updatedAt: Date) =>
      ticketRow(reference, { requesterId: requester.user.id, summary, currentStatus, updatedAt })

    await prisma.ticket.createMany({
      data: [row('before', 'CLOSED', new Date(start.getTime() - 1)), row('boundary', 'CANCELLED', start)],
    })
    const onlyBoundary = await getStaffDashboard(reader.cookie)
    expect(onlyBoundary.body.recentlyUpdated.map((t: { summary: string }) => t.summary)).toEqual(['boundary'])

    await prisma.ticket.createMany({
      data: [10, 20, 30, 40, 50].map((minutes) => row(`at ${minutes}`, 'CLOSED', minutesAfter(start, minutes))),
    })
    const full = await getStaffDashboard(reader.cookie)

    expect(full.body.recentlyUpdated.map((t: { summary: string }) => t.summary)).toEqual([
      'at 50',
      'at 40',
      'at 30',
      'at 20',
      'at 10',
    ])
    expect(full.body.recentlyUpdated[0].owner).toBeNull()
  })

  // DASH-11 (AC-34)
  it('gives counts equal to the totals of their drill-downs', async () => {
    await prisma.ticket.createMany({
      data: ALL_STATUSES.map((currentStatus, index) =>
        ticketRow(reference, {
          requesterId: requester.user.id,
          currentStatus,
          ownerId: index % 2 === 0 ? staff.user.id : null,
          itPriority: (['LOW', 'MEDIUM', 'HIGH'] as const)[index % 3],
        }),
      ),
    })
    const queueTotal = async (query: Record<string, string>) => {
      const res = await request(app)
        .get('/api/staff/tickets')
        .query({ status: UNFINISHED.join(','), ...query })
        .set('Cookie', staff.cookie)
      expect(res.status).toBe(200)
      return res.body.meta.totalItems
    }

    const { body } = await getStaffDashboard(staff.cookie)

    expect(await queueTotal({ owner: 'unassigned' })).toBe(body.unassignedCount)
    expect(await queueTotal({ owner: 'me' })).toBe(body.ownedByMeCount)
    for (const status of UNFINISHED) {
      expect(await queueTotal({ status }), status).toBe(body.byStatus[status])
    }
    for (const itPriority of ['LOW', 'MEDIUM', 'HIGH']) {
      expect(await queueTotal({ itPriority }), itPriority).toBe(body.byItPriority[itPriority])
    }
  })

  it('gives Requester counts equal to the totals of their My Tickets drill-downs', async () => {
    const owner = await signInAs('REQUESTER')
    await prisma.ticket.createMany({
      data: ALL_STATUSES.map((currentStatus) => ticketRow(reference, { requesterId: owner.user.id, currentStatus })),
    })
    const listTotal = async (currentStatus: string) => {
      const res = await request(app).get('/api/tickets').query({ currentStatus }).set('Cookie', owner.cookie)
      expect(res.status).toBe(200)
      return res.body.meta.totalItems
    }

    const { body } = await request(app).get('/api/requester/dashboard').set('Cookie', owner.cookie)

    expect(await listTotal('NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED')).toBe(body.openCount)
    expect(await listTotal('WAITING_FOR_REQUESTER')).toBe(body.waitingForRequesterCount)
  })

  // DASH-14 (AC-37)
  it('holds only the documented fields, and no description, comment, or note', async () => {
    const { now } = freshWindow()
    installFakeClock(now)
    const assignee = await signInAs('IT_STAFF')
    const ticket = await prisma.ticket.create({
      data: ticketRow(reference, {
        requesterId: requester.user.id,
        currentStatus: 'OPEN',
        itPriority: 'HIGH',
        ownerId: assignee.user.id,
        description: `${SECRET} description text`,
        updatedAt: minutesAfter(now, -1),
      }),
    })
    await prisma.publicComment.create({
      data: { ticketId: ticket.id, authorId: assignee.user.id, body: `${SECRET} comment` },
    })
    await prisma.internalNote.create({
      data: { ticketId: ticket.id, authorId: assignee.user.id, body: `${SECRET} note` },
    })
    await prisma.actionTaken.create({
      data: actionTakenRow({
        ticketId: ticket.id,
        assigneeId: assignee.user.id,
        status: 'PLANNED',
        actionAt: now,
        followUpNote: `${SECRET} follow-up`,
        attachmentNotes: `${SECRET} attachment notes`,
      }),
    })

    const res = await getStaffDashboard(assignee.cookie)

    expect(Object.keys(res.body).sort()).toEqual([
      'byItPriority',
      'byStatus',
      'myPlannedActionsTaken',
      'myPlannedActionsTakenCount',
      'ownedByMeCount',
      'recentlyUpdated',
      'unassignedCount',
      'urgent',
    ])
    const expected = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: ticket.summary,
      currentStatus: 'OPEN',
      itPriority: 'HIGH',
      owner: { id: assignee.user.id, name: assignee.user.name },
      updatedAt: ticket.updatedAt.toISOString(),
    }
    expect(res.body.recentlyUpdated).toEqual([expected])
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
  })

  // api-spec.md §1.4: a dashboard is never served stale, a refusal included.
  it('is never cached', async () => {
    const allowed = await getStaffDashboard(staff.cookie)
    const refused = await getStaffDashboard(requester.cookie)

    expect(allowed.headers['cache-control']).toBe('no-store')
    expect(refused.status).toBe(403)
    expect(refused.headers['cache-control']).toBe('no-store')
  })
})

describe('GET /api/admin/dashboard', () => {
  // DASH-10 (AC-33)
  it('counts the active users of each role and only those, and returns nothing else', async () => {
    const before = (await getAdminDashboard(administrator.cookie)).body.activeUsers
    await signInAs('REQUESTER')
    const leaving = await signInAs('IT_STAFF')
    await prisma.user.update({ where: { id: leaving.user.id }, data: { isActive: false } })

    const res = await getAdminDashboard(administrator.cookie)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body)).toEqual(['activeUsers'])
    expect(res.body.activeUsers).toEqual({
      REQUESTER: await prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
      IT_STAFF: await prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
      ADMINISTRATOR: await prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
    })
    expect(res.body.activeUsers.REQUESTER).toBe(before.REQUESTER + 1)
    expect(res.body.activeUsers.IT_STAFF).toBe(before.IT_STAFF)
  })

  it('gives an Administrator the same staff dashboard as IT Staff', async () => {
    const ofStaff = await getStaffDashboard(staff.cookie)
    const ofAdministrator = await getStaffDashboard(administrator.cookie)

    expect(ofAdministrator.status).toBe(200)
    expect(ofAdministrator.body.unassignedCount).toBe(ofStaff.body.unassignedCount)
    expect(ofAdministrator.body.byStatus).toEqual(ofStaff.body.byStatus)
    expect(ofAdministrator.body.byItPriority).toEqual(ofStaff.body.byItPriority)
    expect(ofAdministrator.body.urgent).toEqual(ofStaff.body.urgent)
  })

  it('is never cached', async () => {
    const res = await getAdminDashboard(administrator.cookie)

    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('dashboards on an empty database', () => {
  // DASH-12 (AC-35)
  it('answers 200 with every count 0, every key present, and every list empty', async () => {
    const database = await createThrowawayDatabase('dashboard_empty')
    try {
      await prismaCli(database.url, 'migrate', 'deploy')
      const empty = await applicationOn(database.url)
      const { cookie } = await empty.signInAs('IT_STAFF')

      const res = await request(empty.app).get('/api/staff/dashboard').set('Cookie', cookie)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        unassignedCount: 0,
        ownedByMeCount: 0,
        myPlannedActionsTakenCount: 0,
        byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, REOPENED: 0 },
        byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
        myPlannedActionsTaken: [],
        urgent: [],
        recentlyUpdated: [],
      })
    } finally {
      await database.drop()
    }
  })

  it('counts 0 for a role with no active user', async () => {
    const database = await createThrowawayDatabase('dashboard_roles')
    try {
      await prismaCli(database.url, 'migrate', 'deploy')
      const empty = await applicationOn(database.url)
      const { cookie } = await empty.signInAs('ADMINISTRATOR')

      const res = await request(empty.app).get('/api/admin/dashboard').set('Cookie', cookie)

      expect(res.body).toEqual({ activeUsers: { REQUESTER: 0, IT_STAFF: 0, ADMINISTRATOR: 1 } })
    } finally {
      await database.drop()
    }
  })
})

describe('a database failure', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // DASH-15 (AC-45, BR-34)
  it.each([
    { name: 'Requester', path: '/api/requester/dashboard', who: () => requester, fails: () => prisma.ticket },
    { name: 'IT Staff', path: '/api/staff/dashboard', who: () => staff, fails: () => prisma.ticket },
    { name: 'Administrator', path: '/api/admin/dashboard', who: () => administrator, fails: () => prisma.user },
  ])('answers the $name dashboard with the generic body', async ({ path, who, fails }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('connect ECONNREFUSED postgres://secret@db:5432/toktickit')
    const model = fails()
    if (model === prisma.user) vi.spyOn(prisma.user, 'groupBy').mockRejectedValueOnce(failure as never)
    else vi.spyOn(prisma.ticket, 'count').mockRejectedValueOnce(failure)

    const res = await request(app).get(path).set('Cookie', who().cookie)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' })
  })
})
