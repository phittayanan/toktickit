import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import {
  applicationOn,
  createThrowawayDatabase,
  migrationNames,
  migrationSql,
  prismaCli,
  type ThrowawayDatabase,
} from './support/throwawayDatabase'

// The schema Lab 2 shipped. Everything after these is the Lab 3 migration.
const LAB_2_MIGRATIONS = ['20260822144845_init_category', '20260902120109_lab2_reference_data']

// Lab 2 rows as the application left them: no IT Priority on any Ticket
// (L2 BR-12), an email that was stored in mixed case, an inactive
// Requester, and a soft-removed Attachment.
const LAB_2_FIXTURE = `
  INSERT INTO "Category" ("id", "name") VALUES (1, 'Hardware'), (2, 'Software');
  INSERT INTO "RelatedSystem" ("id", "name") VALUES (1, 'Email'), (2, 'VPN');

  INSERT INTO "RequesterUser" ("id", "name", "email", "isActive", "createdAt") VALUES
    (11, 'Fixture One', 'fixture.one@example.com', true, '2026-09-01T08:00:00Z'),
    (12, 'Fixture Two', 'Fixture.Two@Example.COM', true, '2026-09-02T08:00:00Z'),
    (13, 'Fixture Three', 'fixture.three@example.com', false, '2026-09-03T08:00:00Z');

  INSERT INTO "Ticket"
    ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "updatedAt")
  VALUES
    (101, 'TKT-2026-000001', 11, 1, 1, 'Laptop will not start', 'The laptop shows a black screen.', 'LOW', '2026-09-04T08:00:00Z'),
    (102, 'TKT-2026-000002', 12, 2, 2, 'VPN disconnects', 'The VPN drops every ten minutes.', 'MEDIUM', '2026-09-05T08:00:00Z'),
    (103, 'TKT-2026-000003', 12, 1, 2, 'Cannot reach email', 'Email has been unreachable all day.', 'HIGH', '2026-09-06T08:00:00Z'),
    (104, 'TKT-2026-000004', 13, 2, 1, 'Licence has expired', 'The editor reports an expired licence.', 'LOW', '2026-09-07T08:00:00Z');

  INSERT INTO "Attachment"
    ("id", "ticketId", "uploadedByRequesterId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "removedAt", "removedByRequesterId", "removalReason")
  VALUES
    (201, 101, 11, 'screen.png', 'fixture-201.png', 'image/png', 4, NULL, NULL, NULL),
    (202, 102, 12, 'log.txt', 'fixture-202.txt', 'text/plain', 9, '2026-09-08T08:00:00Z', 12, 'Wrong file');
`

// The documented local-development seed password (specification.md §7.4).
const SEED_PASSWORD = 'TokTickIT-Lab3!'
const BCRYPT_HASH = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/
const WRITES_PASSWORD_HASH = /\b(INSERT|UPDATE)\b[^;]*"passwordHash"/i

const PRESERVED_TABLES = ['Category', 'RelatedSystem', 'Attachment'] as const

let database: ThrowawayDatabase
const lab2Rows: Record<string, unknown[]> = {}

async function rows(sql: string) {
  return (await database.client.query(sql)).rows
}

beforeAll(async () => {
  database = await createThrowawayDatabase('migration')
  const lab3Migrations = migrationNames().filter((name) => !LAB_2_MIGRATIONS.includes(name))

  for (const name of LAB_2_MIGRATIONS) {
    await database.client.query(migrationSql(name))
  }
  await database.client.query(LAB_2_FIXTURE)
  for (const table of PRESERVED_TABLES) {
    lab2Rows[table] = await rows(`SELECT * FROM "${table}" ORDER BY "id"`)
  }

  for (const name of lab3Migrations) {
    await database.client.query(migrationSql(name))
  }
})

afterAll(async () => {
  await database.drop()
})

describe('Lab 3 migration over a Lab 2 database', () => {
  // MIG-01 (AC-48, BR-45, BR-06)
  it('turns every RequesterUser into a User with the same id, role Requester, and no password', async () => {
    const users = await rows(`
      SELECT "id", "name", "email", "isActive", "createdAt", "role"::text, "passwordHash", "mustChangePassword"
      FROM "User" ORDER BY "id"
    `)

    const migrated = { role: 'REQUESTER', passwordHash: null, mustChangePassword: true }
    expect(users).toEqual([
      {
        id: 11,
        name: 'Fixture One',
        email: 'fixture.one@example.com',
        isActive: true,
        createdAt: new Date('2026-09-01T08:00:00'),
        ...migrated,
      },
      {
        id: 12,
        name: 'Fixture Two',
        email: 'fixture.two@example.com',
        isActive: true,
        createdAt: new Date('2026-09-02T08:00:00'),
        ...migrated,
      },
      {
        id: 13,
        name: 'Fixture Three',
        email: 'fixture.three@example.com',
        isActive: false,
        createdAt: new Date('2026-09-03T08:00:00'),
        ...migrated,
      },
    ])

    expect(await rows(`SELECT to_regclass('"RequesterUser"') AS "table"`)).toEqual([{ table: null }])
  })

  // MIG-02 (AC-48, FR-27)
  it('keeps every Ticket, Attachment, Category, and Related System with the Requester it had', async () => {
    for (const table of PRESERVED_TABLES) {
      expect(await rows(`SELECT * FROM "${table}" ORDER BY "id"`)).toEqual(lab2Rows[table])
    }

    expect(await rows('SELECT "id", "ticketNumber", "requesterId" FROM "Ticket" ORDER BY "id"')).toEqual([
      { id: 101, ticketNumber: 'TKT-2026-000001', requesterId: 11 },
      { id: 102, ticketNumber: 'TKT-2026-000002', requesterId: 12 },
      { id: 103, ticketNumber: 'TKT-2026-000003', requesterId: 12 },
      { id: 104, ticketNumber: 'TKT-2026-000004', requesterId: 13 },
    ])
    expect(
      await rows('SELECT "id", "uploadedByRequesterId", "removedByRequesterId" FROM "Attachment" ORDER BY "id"'),
    ).toEqual([
      { id: 201, uploadedByRequesterId: 11, removedByRequesterId: null },
      { id: 202, uploadedByRequesterId: 12, removedByRequesterId: 12 },
    ])

    // The three ownership columns keep their names and now point at User
    // (specification.md §7.1).
    const ownershipTargets = await rows(`
      SELECT c.conname AS "constraint", c.confrelid::regclass::text AS "references"
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.conname IN (
        'Ticket_requesterId_fkey',
        'Attachment_uploadedByRequesterId_fkey',
        'Attachment_removedByRequesterId_fkey'
      )
      ORDER BY c.conname
    `)
    expect(ownershipTargets).toEqual([
      { constraint: 'Attachment_removedByRequesterId_fkey', references: '"User"' },
      { constraint: 'Attachment_uploadedByRequesterId_fkey', references: '"User"' },
      { constraint: 'Ticket_requesterId_fkey', references: '"User"' },
    ])
  })

  // MIG-03 (AC-48, BR-26)
  it('sets every IT Priority to the Requested Priority and leaves each Ticket New and unassigned', async () => {
    const tickets = await rows(`
      SELECT "id", "requestedPriority"::text, "itPriority"::text, "currentStatus"::text,
        "ownerId", "ownerChangedAt", "resolutionSummary", "resolvedAt", "requesterResolvedAt"
      FROM "Ticket" ORDER BY "id"
    `)

    const untouched = {
      currentStatus: 'NEW',
      ownerId: null,
      ownerChangedAt: null,
      resolutionSummary: null,
      resolvedAt: null,
      requesterResolvedAt: null,
    }
    expect(tickets).toEqual([
      { id: 101, requestedPriority: 'LOW', itPriority: 'LOW', ...untouched },
      { id: 102, requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', ...untouched },
      { id: 103, requestedPriority: 'HIGH', itPriority: 'HIGH', ...untouched },
      { id: 104, requestedPriority: 'LOW', itPriority: 'LOW', ...untouched },
    ])

    // IT Priority is required from now on (specification.md §7.1).
    await expect(
      database.client.query('UPDATE "Ticket" SET "itPriority" = NULL WHERE "id" = 101'),
    ).rejects.toThrow(/not-null constraint/)
  })

  // MIG-04 (AC-48, BR-45). Pending #47 (POST /api/auth/login) and #53
  // (POST /api/admin/users/:id/initial-password); remove `.skip` when both
  // have landed.
  it.skip('refuses a migrated user until an Administrator sets an initial password', async () => {
    const { app, signInAs } = await applicationOn(database.url)
    const migrated = { id: 11, email: 'fixture.one@example.com' }

    const before = await request(app)
      .post('/api/auth/login')
      .send({ email: migrated.email, password: SEED_PASSWORD })
    expect(before.status).toBe(401)
    expect(before.body.code).toBe('INVALID_CREDENTIALS')

    const administrator = await signInAs('ADMINISTRATOR')
    const issued = await request(app)
      .post(`/api/admin/users/${migrated.id}/initial-password`)
      .set('Cookie', administrator.cookie)
    expect(issued.status).toBe(200)

    const after = await request(app)
      .post('/api/auth/login')
      .send({ email: migrated.email, password: issued.body.initialPassword })
    expect(after.status).toBe(200)
    expect(after.body).toMatchObject({ id: migrated.id, role: 'REQUESTER', mustChangePassword: true })
  })

  // MIG-05 (AC-48, BR-46)
  it('has no password and no password hash in any migration file', () => {
    for (const name of migrationNames()) {
      const sql = migrationSql(name)

      expect(sql, name).not.toMatch(BCRYPT_HASH)
      expect(sql, name).not.toContain(SEED_PASSWORD)
      expect(sql, name).not.toMatch(WRITES_PASSWORD_HASH)
    }
  })

  // The migration is written by hand, so nothing but this keeps it and
  // schema.prisma describing the same database.
  it('leaves exactly the schema that schema.prisma describes', async () => {
    const diff = await prismaCli(
      database.url,
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    )

    expect(diff.stdout.trim()).toBe('-- This is an empty migration.')
  }, 30_000)
})
