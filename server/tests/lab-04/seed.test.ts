import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createThrowawayDatabase, prismaCli, type ThrowawayDatabase } from '../lab-03/support/throwawayDatabase'

const DAY = 24 * 60 * 60 * 1000
const UNFINISHED = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'REOPENED']

interface SeedAction {
  ticketNumber: string
  ticketStatus: string
  ownerId: number | null
  requester: string
  status: string
  assigneeId: number
  assignee: string
  createdById: number
  actionAt: Date
  result: string | null
  followUpRequired: boolean
  followUpNote: string | null
}

let database: ThrowawayDatabase
let actions: SeedAction[]

async function rows(sql: string) {
  return (await database.client.query(sql)).rows
}

async function everyTable() {
  const tables = await rows(`SELECT "tablename" FROM pg_tables WHERE "schemaname" = 'public' ORDER BY 1`)
  const snapshot: Record<string, unknown[]> = {}
  for (const { tablename } of tables) {
    if (tablename !== '_prisma_migrations') {
      snapshot[tablename] = await rows(`SELECT * FROM "${tablename}" ORDER BY 1`)
    }
  }
  return snapshot
}

const seed = () => prismaCli(database.url, 'db', 'seed')

const actionsByTicket = () => {
  const byTicket = new Map<string, SeedAction[]>()
  for (const action of actions) {
    byTicket.set(action.ticketNumber, [...(byTicket.get(action.ticketNumber) ?? []), action])
  }
  return [...byTicket.values()]
}

const statusesOf = (list: SeedAction[]) => new Set(list.map((action) => action.status))

beforeAll(async () => {
  database = await createThrowawayDatabase('lab4_seed')
  await prismaCli(database.url, 'migrate', 'deploy')
  await seed()

  actions = (await rows(`
    SELECT t."ticketNumber", t."currentStatus"::text AS "ticketStatus", t."ownerId",
      r."email" AS "requester", a."status"::text, a."assigneeId", u."email" AS "assignee",
      a."createdById", a."actionAt", a."result", a."followUpRequired", a."followUpNote"
    FROM "ActionTaken" a
    JOIN "Ticket" t ON t."id" = a."ticketId"
    JOIN "User" r ON r."id" = t."requesterId"
    JOIN "User" u ON u."id" = a."assigneeId"
  `)) as SeedAction[]
}, 60_000)

afterAll(async () => {
  await database.drop()
})

describe('Lab 4 seed', () => {
  // MIG-03 (AC-41, BR-47)
  it('changes no row when it runs again', async () => {
    const before = await everyTable()

    await seed()

    expect(before.ActionTaken.length).toBeGreaterThan(0)
    expect(await everyTable()).toEqual(before)
  }, 30_000)

  // MIG-04 (AC-41, specification.md §7.5)
  it('continues the reserved block and gives the Lab 3 seed Tickets no Action Taken', async () => {
    const numbers = (await rows('SELECT "ticketNumber" FROM "Ticket" ORDER BY 1')).map((row) => row.ticketNumber)

    expect(numbers.length).toBeGreaterThan(24)
    expect(numbers).toEqual(numbers.map((_, index) => `TKT-2026-${900001 + index}`))
    for (const action of actions) {
      expect(action.ticketNumber > 'TKT-2026-900024', action.ticketNumber).toBe(true)
    }
  })

  // MIG-04 (AC-41, specification.md §7.5)
  it('provides Tickets with one and with several Actions Taken in every status', () => {
    const byTicket = actionsByTicket()

    expect(byTicket.some((list) => list.length === 1)).toBe(true)
    expect(byTicket.some((list) => list.length > 1)).toBe(true)
    expect(statusesOf(actions)).toEqual(new Set(['PLANNED', 'DONE', 'CANCELLED']))
    expect(actions.some((action) => action.followUpRequired)).toBe(true)
    expect(actions.some((action) => action.ownerId !== null && action.assigneeId !== action.ownerId)).toBe(true)
    expect(actions.some((action) => action.ownerId === null)).toBe(true)
  })

  // MIG-04 (AC-41, specification.md §7.5, BR-19)
  it('provides Tickets past the Resolution Gate and blocked by each condition', () => {
    const open = actionsByTicket().filter((list) => ['IN_PROGRESS', 'REOPENED'].includes(list[0].ticketStatus))
    const passes = (list: SeedAction[]) => statusesOf(list).has('DONE') && !statusesOf(list).has('PLANNED')
    const noDone = (list: SeedAction[]) => !statusesOf(list).has('DONE')
    const plannedRemains = (list: SeedAction[]) => statusesOf(list).has('DONE') && statusesOf(list).has('PLANNED')

    expect(open.filter((list) => list[0].ownerId !== null).some(passes)).toBe(true)
    expect(open.some(noDone)).toBe(true)
    expect(open.some(plannedRemains)).toBe(true)
  })

  // MIG-04 (AC-41, BR-03 to BR-09): each row is one the API would accept.
  it('holds only Actions Taken the rules allow', async () => {
    const seededAt = Date.now()

    for (const action of actions) {
      if (action.status === 'DONE') {
        expect(action.result, action.ticketNumber).not.toBeNull()
        expect(action.actionAt.getTime(), action.ticketNumber).toBeLessThanOrEqual(seededAt)
      }
      expect(action.followUpNote !== null, action.ticketNumber).toBe(action.followUpRequired)
    }

    const assignees = await rows(`
      SELECT DISTINCT u."role"::text, u."isActive" FROM "ActionTaken" a JOIN "User" u ON u."id" = a."assigneeId"
    `)
    for (const assignee of assignees) {
      expect(['IT_STAFF', 'ADMINISTRATOR']).toContain(assignee.role)
      expect(assignee.isActive).toBe(true)
    }
  })

  // MIG-04 (AC-41, specification.md §7.5, BR-28): dated by the seed run, so
  // the recent lists have something to show.
  it('gives one Requester and one IT Staff user metrics, and others none', async () => {
    const recent = new Date(Date.now() - 6 * DAY)
    const requesters = await rows(`
      SELECT u."email",
        count(t."id") FILTER (WHERE t."updatedAt" >= '${recent.toISOString()}')::int AS "updated",
        count(t."id") FILTER (WHERE t."resolvedAt" >= '${recent.toISOString()}'
          AND t."currentStatus" IN ('RESOLVED', 'CLOSED'))::int AS "resolved",
        count(t."id") FILTER (WHERE t."currentStatus" = 'WAITING_FOR_REQUESTER')::int AS "waiting"
      FROM "User" u JOIN "Ticket" t ON t."requesterId" = u."id"
      WHERE u."isActive" AND u."role" = 'REQUESTER'
      GROUP BY u."email"
    `)
    expect(requesters.some((row) => row.updated > 0 && row.resolved > 0 && row.waiting > 0)).toBe(true)
    expect(requesters.some((row) => row.updated === 0 && row.resolved === 0)).toBe(true)

    const planned = await rows(`
      SELECT u."email",
        count(a."id") FILTER (WHERE a."status" = 'PLANNED'
          AND t."currentStatus" IN (${UNFINISHED.map((status) => `'${status}'`).join(', ')}))::int AS "count"
      FROM "User" u
      LEFT JOIN "ActionTaken" a ON a."assigneeId" = u."id"
      LEFT JOIN "Ticket" t ON t."id" = a."ticketId"
      WHERE u."isActive" AND u."role" = 'IT_STAFF'
      GROUP BY u."email"
    `)
    expect(planned.some((row) => row.count > 0)).toBe(true)
    expect(planned.some((row) => row.count === 0)).toBe(true)
  })
})
