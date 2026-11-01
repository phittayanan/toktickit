import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createThrowawayDatabase,
  migrationNames,
  migrationSql,
  prismaCli,
  type ThrowawayDatabase,
} from '../lab-03/support/throwawayDatabase'

const LAB_4_MIGRATION = '20261030120000_lab4_actions_taken'
const ROLLBACK_FILE = 'prisma/rollback/lab4_actions_taken.down.sql'

// A Lab 3 database with a row in every table a person's work is stored in.
const LAB_3_FIXTURE = `
  INSERT INTO "Category" ("id", "name") VALUES (1, 'Hardware');
  INSERT INTO "RelatedSystem" ("id", "name") VALUES (1, 'Email');

  INSERT INTO "User" ("id", "name", "email", "role", "passwordHash", "mustChangePassword", "updatedAt") VALUES
    (11, 'Fixture Requester', 'requester@example.com', 'REQUESTER', 'hash-11', false, '2026-09-01T08:00:00Z'),
    (12, 'Fixture Staff', 'staff@example.com', 'IT_STAFF', 'hash-12', false, '2026-09-01T08:00:00Z');

  INSERT INTO "Session" ("id", "tokenHash", "userId", "lastSeenAt", "expiresAt") VALUES
    (21, 'token-hash', 11, '2026-09-01T08:00:00Z', '2026-09-02T08:00:00Z');

  INSERT INTO "Ticket"
    ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description",
     "requestedPriority", "itPriority", "currentStatus", "ownerId", "ownerChangedAt",
     "resolutionSummary", "resolvedAt", "updatedAt")
  VALUES
    (101, 'TKT-2026-000001', 11, 1, 1, 'Laptop will not start', 'The laptop shows a black screen.',
     'LOW', 'HIGH', 'RESOLVED', 12, '2026-09-04T08:00:00Z',
     'Replaced the power supply.', '2026-09-05T08:00:00Z', '2026-09-05T08:00:00Z'),
    (102, 'TKT-2026-000002', 11, 1, 1, 'VPN disconnects', 'The VPN drops every ten minutes.',
     'MEDIUM', 'MEDIUM', 'NEW', NULL, NULL, NULL, NULL, '2026-09-06T08:00:00Z');

  INSERT INTO "Attachment"
    ("id", "ticketId", "uploadedByRequesterId", "originalFilename", "storedFilename", "mimeType", "sizeBytes")
  VALUES (201, 101, 11, 'screen.png', 'fixture-201.png', 'image/png', 4);

  INSERT INTO "PublicComment" ("id", "ticketId", "authorId", "body") VALUES (301, 101, 11, 'Any news on this?');
  INSERT INTO "InternalNote" ("id", "ticketId", "authorId", "body") VALUES (401, 101, 12, 'Spare in storeroom B.');
  INSERT INTO "TicketCounter" ("year", "lastNumber") VALUES (2026, 2);
`

const LAB_3_TABLES = [
  'Category',
  'RelatedSystem',
  'User',
  'Session',
  'Ticket',
  'Attachment',
  'PublicComment',
  'InternalNote',
  'TicketCounter',
] as const

let database: ThrowawayDatabase
let lab3Rows: Record<string, unknown[]>
let lab3Schema: unknown

async function rows(sql: string) {
  return (await database.client.query(sql)).rows
}

async function everyLab3Row() {
  const snapshot: Record<string, unknown[]> = {}
  for (const table of LAB_3_TABLES) {
    snapshot[table] = await rows(`SELECT * FROM "${table}" ORDER BY 1`)
  }
  return snapshot
}

// The schema as the catalog holds it, so "restored" means tables, columns,
// indexes, constraints, and enums alike.
async function schemaDescription() {
  return {
    columns: await rows(`
      SELECT "table_name", "column_name", "data_type", "udt_name", "is_nullable", "column_default"
      FROM information_schema.columns WHERE "table_schema" = 'public' AND "table_name" <> '_prisma_migrations'
      ORDER BY 1, 2
    `),
    indexes: await rows(`
      SELECT "tablename", "indexname", "indexdef" FROM pg_indexes
      WHERE "schemaname" = 'public' AND "tablename" <> '_prisma_migrations'
      ORDER BY 1, 2
    `),
    constraints: await rows(`
      SELECT c."conname", pg_get_constraintdef(c."oid") AS "definition"
      FROM pg_constraint c JOIN pg_namespace n ON n."oid" = c."connamespace"
      WHERE n."nspname" = 'public' AND c."conname" NOT LIKE '_prisma_migrations%'
      ORDER BY 1
    `),
    enums: await rows(`
      SELECT t."typname", e."enumlabel" FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
      ORDER BY 1, e."enumsortorder"
    `),
  }
}

const appliedLab4 = () => rows(`SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '${LAB_4_MIGRATION}'`)

beforeAll(async () => {
  database = await createThrowawayDatabase('lab4_migration')

  // Every earlier migration, recorded as applied, so that `migrate deploy`
  // below is the documented path and runs the Lab 4 one alone.
  const earlier = migrationNames().filter((name) => name < LAB_4_MIGRATION)
  for (const name of earlier) {
    await database.client.query(migrationSql(name))
    await prismaCli(database.url, 'migrate', 'resolve', '--applied', name)
  }
  await database.client.query(LAB_3_FIXTURE)

  lab3Rows = await everyLab3Row()
  lab3Schema = await schemaDescription()
}, 120_000)

afterAll(async () => {
  await database.drop()
})

// These run in order against one database: migrate, roll back, migrate again.
describe('Lab 4 migration over a Lab 3 database', () => {
  // MIG-01 (AC-39, FR-16)
  it('adds an empty ActionTaken table and leaves every earlier row as it was', async () => {
    await prismaCli(database.url, 'migrate', 'deploy')

    expect(await appliedLab4()).toHaveLength(1)
    expect(await rows('SELECT * FROM "ActionTaken"')).toEqual([])
    expect(await everyLab3Row()).toEqual(lab3Rows)
  }, 30_000)

  // MIG-01 (FR-16, specification.md §7.3)
  it('only adds to the schema: no existing column changes', async () => {
    const { columns: before } = lab3Schema as { columns: { table_name: string }[] }
    const { columns: after } = await schemaDescription()

    expect(after.filter((column) => column.table_name !== 'ActionTaken')).toEqual(before)
  })

  // specification.md §7.1
  it('holds the §7.1 keys and indexes', async () => {
    const indexes = await rows(`
      SELECT "indexdef" FROM pg_indexes WHERE "tablename" IN ('ActionTaken', 'Ticket') ORDER BY 1
    `)
    const definitions = indexes.map((index) => index.indexdef).join('\n')

    expect(definitions).toMatch(/UNIQUE INDEX .* ON public."ActionTaken" USING btree \("ticketId", "clientRequestId"\)/)
    expect(definitions).toMatch(/ON public."ActionTaken" USING btree \("ticketId", "createdAt"\)/)
    expect(definitions).toMatch(/ON public."ActionTaken" USING btree \("assigneeId", status\)/)
    expect(definitions).toMatch(/ON public."Ticket" USING btree \("updatedAt"\)/)

    const foreignKeys = await rows(`
      SELECT c."conname", c."confdeltype" FROM pg_constraint c
      WHERE c."conrelid" = '"ActionTaken"'::regclass AND c."contype" = 'f'
      ORDER BY 1
    `)
    expect(foreignKeys).toEqual([
      { conname: 'ActionTaken_assigneeId_fkey', confdeltype: 'r' },
      { conname: 'ActionTaken_createdById_fkey', confdeltype: 'r' },
      { conname: 'ActionTaken_ticketId_fkey', confdeltype: 'r' },
    ])
  })

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

  // MIG-02 (AC-40, specification.md §7.4)
  it('rolls back to the Lab 3 schema, keeping every earlier row', async () => {
    await database.client.query(`
      INSERT INTO "ActionTaken"
        ("ticketId", "actionAt", "description", "assigneeId", "status", "createdById", "updatedAt", "clientRequestId")
      VALUES (101, now(), 'Lost with the rollback.', 12, 'PLANNED', 12, now(), 'key-1')
    `)

    await prismaCli(database.url, 'db', 'execute', '--file', ROLLBACK_FILE)

    expect(await rows(`SELECT to_regclass('"ActionTaken"') AS "table"`)).toEqual([{ table: null }])
    expect(await rows(`SELECT 1 FROM pg_type WHERE "typname" = 'ActionTakenStatus'`)).toEqual([])
    expect(await appliedLab4()).toEqual([])
    expect(await schemaDescription()).toEqual(lab3Schema)
    expect(await everyLab3Row()).toEqual(lab3Rows)
  }, 30_000)

  // MIG-02 (AC-40)
  it('applies the migration again after a rollback', async () => {
    await prismaCli(database.url, 'migrate', 'deploy')

    expect(await appliedLab4()).toHaveLength(1)
    expect(await rows('SELECT * FROM "ActionTaken"')).toEqual([])
    expect(await everyLab3Row()).toEqual(lab3Rows)
  }, 30_000)
})
