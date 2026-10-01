import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import request from 'supertest'
import {
  applicationOn,
  createThrowawayDatabase,
  prismaCli,
  type ThrowawayDatabase,
} from './support/throwawayDatabase'

// The documented local-development seed password (specification.md §7.4).
const SEED_PASSWORD = 'TokTickIT-Lab3!'

// The seed accounts as the README documents them.
const SEED_ACCOUNTS = [
  { email: 'somchai.jaidee@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { email: 'nalinee.suksawat@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { email: 'kittipong.rattanakosin@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { email: 'ploy.wongsawang@kmutt.ac.th', role: 'REQUESTER', isActive: true },
  { email: 'anucha.boonmee@kmutt.ac.th', role: 'REQUESTER', isActive: false },
  { email: 'wichai.phromma@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { email: 'siriporn.kaewmanee@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { email: 'thanakorn.srisuk@kmutt.ac.th', role: 'IT_STAFF', isActive: true },
  { email: 'pranee.chaiyasit@kmutt.ac.th', role: 'IT_STAFF', isActive: false },
  { email: 'apinya.thongchai@kmutt.ac.th', role: 'ADMINISTRATOR', isActive: true },
]

let database: ThrowawayDatabase

async function rows(sql: string) {
  return (await database.client.query(sql)).rows
}

// Every row of every table, to see exactly what a seed run changed.
async function everyTable() {
  const tables = await rows(`SELECT "tablename" FROM pg_tables WHERE "schemaname" = 'public' ORDER BY 1`)
  const snapshot: Record<string, unknown[]> = {}
  for (const { tablename } of tables) {
    snapshot[tablename] = await rows(`SELECT * FROM "${tablename}" ORDER BY 1`)
  }
  return snapshot
}

// The real seed, run the documented way (specification.md §7.4).
function seed() {
  return prismaCli(database.url, 'db', 'seed')
}

beforeAll(async () => {
  database = await createThrowawayDatabase('seed')
  await prismaCli(database.url, 'migrate', 'deploy')
  await seed()
}, 60_000)

afterAll(async () => {
  await database.drop()
})

// These run in order against one seeded database: the last two change
// seed accounts, so they come after everything that reads the fresh seed.
describe('seed', () => {
  // MIG-06 (AC-49, FR-28)
  it('provides the Lab 2 reference data and accounts for all three roles', async () => {
    expect(await rows('SELECT "name" FROM "Category" ORDER BY "id"')).toEqual([
      { name: 'Account and Access' },
      { name: 'Hardware' },
      { name: 'Software' },
      { name: 'Network' },
    ])
    expect(await rows('SELECT count(*)::int AS "count" FROM "RelatedSystem"')).toEqual([{ count: 6 }])

    expect(await rows('SELECT "email", "role"::text, "isActive" FROM "User" ORDER BY "id"')).toEqual(SEED_ACCOUNTS)
  })

  // MIG-06 (AC-49, BR-46, BR-07)
  it('gives every seed account the documented initial password, which it must change', async () => {
    const users = await rows('SELECT "email", "passwordHash", "mustChangePassword" FROM "User"')

    for (const user of users) {
      expect(user.mustChangePassword, user.email).toBe(true)
      expect(user.passwordHash, user.email).toMatch(/^\$2b\$12\$/)
      expect(await bcrypt.compare(SEED_PASSWORD, user.passwordHash), user.email).toBe(true)
    }
  }, 30_000)

  // MIG-06 (AC-49, specification.md §7.4 and §11 item 26)
  it('provides at least 24 Tickets in the reserved block with the §7.4 distribution', async () => {
    const tickets = await rows(`
      SELECT t."ticketNumber", t."currentStatus"::text AS "status",
        t."requestedPriority"::text, t."itPriority"::text, t."requesterResolvedAt",
        r."email" AS "requester", o."email" AS "owner"
      FROM "Ticket" t
      JOIN "User" r ON r."id" = t."requesterId"
      LEFT JOIN "User" o ON o."id" = t."ownerId"
      ORDER BY t."ticketNumber"
    `)
    const count = (matches: (ticket: (typeof tickets)[number]) => boolean) => tickets.filter(matches).length

    expect(tickets.length).toBeGreaterThanOrEqual(24)
    // The reserved block starts at TKT-2026-900001 and is filled in order.
    expect(tickets.map((ticket) => ticket.ticketNumber)).toEqual(
      tickets.map((_, index) => `TKT-2026-${900001 + index}`),
    )

    for (const status of [
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_REQUESTER',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
      'CANCELLED',
    ]) {
      expect(count((ticket) => ticket.status === status), status).toBeGreaterThanOrEqual(2)
    }
    for (const priority of ['LOW', 'MEDIUM', 'HIGH']) {
      expect(count((ticket) => ticket.requestedPriority === priority), priority).toBeGreaterThanOrEqual(1)
      expect(count((ticket) => ticket.itPriority === priority), priority).toBeGreaterThanOrEqual(1)
    }

    for (const account of SEED_ACCOUNTS.filter((account) => account.isActive)) {
      if (account.role === 'REQUESTER') {
        expect(count((ticket) => ticket.requester === account.email), account.email).toBeGreaterThanOrEqual(4)
      }
      if (account.role === 'IT_STAFF') {
        expect(count((ticket) => ticket.owner === account.email), account.email).toBeGreaterThanOrEqual(3)
      }
    }

    expect(count((ticket) => ticket.owner === null)).toBeGreaterThanOrEqual(6)
    expect(count((ticket) => ticket.itPriority !== ticket.requestedPriority)).toBeGreaterThanOrEqual(1)
    expect(count((ticket) => ticket.requesterResolvedAt !== null)).toBeGreaterThanOrEqual(2)
    expect(
      count(
        (ticket) =>
          ticket.owner === 'pranee.chaiyasit@kmutt.ac.th' && ['CLOSED', 'CANCELLED'].includes(ticket.status),
      ),
    ).toBeGreaterThanOrEqual(1)
  })

  // MIG-06 (AC-49, FR-28): realistic means reachable through the workflow.
  it('provides Tickets in states the workflow can reach', async () => {
    const tickets = await rows(`
      SELECT t."ticketNumber", t."currentStatus"::text AS "status", t."ownerChangedAt",
        t."resolutionSummary", t."resolvedAt", t."requesterResolvedAt",
        o."role"::text AS "ownerRole", o."isActive" AS "ownerIsActive"
      FROM "Ticket" t LEFT JOIN "User" o ON o."id" = t."ownerId"
    `)

    for (const ticket of tickets) {
      const { ticketNumber: number, status } = ticket
      const finished = ['CLOSED', 'CANCELLED'].includes(status)

      // BR-21, BR-24, BR-25
      if (status === 'NEW') expect(ticket.ownerRole, number).toBeNull()
      if (ticket.ownerRole !== null) {
        expect(['IT_STAFF', 'ADMINISTRATOR'], number).toContain(ticket.ownerRole)
        expect(ticket.ownerChangedAt, number).not.toBeNull()
        if (!finished) expect(ticket.ownerIsActive, number).toBe(true)
      }

      // BR-29: Closed and Reopened are reached only through Resolved.
      if (['RESOLVED', 'CLOSED', 'REOPENED'].includes(status)) {
        expect(ticket.resolutionSummary.length, number).toBeGreaterThanOrEqual(10)
        expect(ticket.resolutionSummary.length, number).toBeLessThanOrEqual(2000)
        expect(ticket.resolvedAt, number).not.toBeNull()
      }

      // BR-33
      if (ticket.requesterResolvedAt !== null) {
        expect(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'], number).toContain(status)
      }
    }
  })

  // MIG-06 (AC-49, FR-28, BR-04, BR-35)
  it('provides Public Comments and Internal Notes on several Tickets', async () => {
    const entries = (table: string) =>
      rows(`
        SELECT e."ticketId", e."body", a."role"::text AS "authorRole",
          e."authorId" = t."requesterId" AS "byRequester"
        FROM "${table}" e
        JOIN "Ticket" t ON t."id" = e."ticketId"
        JOIN "User" a ON a."id" = e."authorId"
      `)
    const comments = await entries('PublicComment')
    const notes = await entries('InternalNote')
    const ticketsWith = (list: { ticketId: number }[]) => new Set(list.map((entry) => entry.ticketId)).size

    expect(ticketsWith(comments)).toBeGreaterThanOrEqual(3)
    expect(ticketsWith(notes)).toBeGreaterThanOrEqual(3)

    // A Public Comment is from the Ticket's own Requester or from staff, in
    // at most 2000 characters; an Internal Note is from staff, in at most
    // 4000.
    for (const comment of comments) {
      expect(comment.byRequester || comment.authorRole !== 'REQUESTER', comment.body).toBe(true)
      expect(comment.body.trim()).not.toBe('')
      expect(comment.body.length).toBeLessThanOrEqual(2000)
    }
    expect(comments.some((comment) => comment.byRequester)).toBe(true)
    expect(comments.some((comment) => !comment.byRequester)).toBe(true)
    for (const note of notes) {
      expect(['IT_STAFF', 'ADMINISTRATOR'], note.body).toContain(note.authorRole)
      expect(note.body.trim()).not.toBe('')
      expect(note.body.length).toBeLessThanOrEqual(4000)
    }
  })

  // MIG-06 (AC-49, BR-47)
  it('changes no row when it runs again', async () => {
    const before = await everyTable()

    await seed()

    expect(before.Ticket.length).toBeGreaterThanOrEqual(24)
    expect(await everyTable()).toEqual(before)
  }, 30_000)

  // MIG-07 (AC-49)
  it('signs each seed account in with the documented password and keeps one that was changed', async () => {
    const { app, signIn } = await applicationOn(database.url)
    const login = (email: string, password: string) =>
      request(app).post('/api/auth/login').send({ email, password })

    for (const account of SEED_ACCOUNTS) {
      const res = await login(account.email, SEED_PASSWORD)

      if (account.isActive) {
        expect(res.status, account.email).toBe(200)
        expect(res.body.mustChangePassword, account.email).toBe(true)
      } else {
        expect(res.status, account.email).toBe(403)
        expect(res.body.code, account.email).toBe('ACCOUNT_INACTIVE')
      }
    }

    const { email } = SEED_ACCOUNTS[0]
    const newPassword = 'Changed-Passw0rd!'
    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', await signIn(email, SEED_PASSWORD))
      .send({ currentPassword: SEED_PASSWORD, newPassword, confirmPassword: newPassword })
    expect(changed.status).toBe(200)

    await seed()

    const withNewPassword = await login(email, newPassword)
    expect(withNewPassword.status).toBe(200)
    expect(withNewPassword.body.mustChangePassword).toBe(false)
    expect((await login(email, SEED_PASSWORD)).status).toBe(401)
  }, 60_000)

  // MIG-06 (AC-49, BR-46, BR-47)
  it('overwrites nothing a person has changed and sets a password only where there is none', async () => {
    const edited = 'nalinee.suksawat@kmutt.ac.th'
    const migrated = 'kittipong.rattanakosin@kmutt.ac.th'
    await database.client.query(`
      UPDATE "User"
      SET "name" = 'Nalinee S.', "role" = 'IT_STAFF', "isActive" = false,
        "passwordHash" = 'a hash of the password this user chose', "mustChangePassword" = false
      WHERE "email" = '${edited}';

      -- A Lab 2 account as the migration leaves it (BR-45).
      UPDATE "User" SET "passwordHash" = NULL WHERE "email" = '${migrated}';

      UPDATE "Ticket" SET "summary" = 'Edited by staff', "currentStatus" = 'CANCELLED', "ownerId" = NULL
      WHERE "ticketNumber" = 'TKT-2026-900005';
      DELETE FROM "PublicComment"
      WHERE "ticketId" = (SELECT "id" FROM "Ticket" WHERE "ticketNumber" = 'TKT-2026-900004');
    `)
    const isMigrated = (user: unknown) => (user as { email: string }).email === migrated
    const before = await everyTable()

    await seed()

    const after = await everyTable()
    const [account] = (after.User as { passwordHash: string; mustChangePassword: boolean }[]).filter(isMigrated)
    expect(await bcrypt.compare(SEED_PASSWORD, account.passwordHash)).toBe(true)
    expect(account.mustChangePassword).toBe(true)

    // Apart from that one account, nothing moved.
    after.User = after.User.filter((user) => !isMigrated(user))
    before.User = before.User.filter((user) => !isMigrated(user))
    expect(after).toEqual(before)
  }, 30_000)
})
