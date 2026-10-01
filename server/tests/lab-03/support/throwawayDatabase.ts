import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { vi } from 'vitest'

type AppModule = typeof import('../../../src/app')
type SignInModule = typeof import('./signIn')

const run = promisify(execFile)

const SERVER_DIR = path.join(__dirname, '..', '..', '..')
const MIGRATIONS_DIR = path.join(SERVER_DIR, 'prisma', 'migrations')

export interface ThrowawayDatabase {
  url: string
  // A direct connection, for inspecting the database as a migration or the
  // seed left it (tests.md §1).
  client: Client
  drop(): Promise<void>
}

function urlOfDatabase(name: string): string {
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = `/${name}`
  return url.toString()
}

// Creates an empty database beside the test database, on the same server.
// A migration or seed test works in its own database so that it starts from
// a known schema and leaves the shared test database as it found it.
export async function createThrowawayDatabase(label: string): Promise<ThrowawayDatabase> {
  // Run-unique, the Lab 2 convention, so an interrupted run never blocks
  // the next one.
  const name = `toktickit_${label}_${Date.now()}_${process.pid}`

  const server = new Client({ connectionString: process.env.DATABASE_URL })
  await server.connect()
  await server.query(`CREATE DATABASE "${name}"`)

  const url = urlOfDatabase(name)
  const client = new Client({ connectionString: url })
  await client.connect()

  return {
    url,
    client,
    async drop() {
      vi.unstubAllEnvs()
      await client.end()
      // FORCE also ends the connections a test's own app instance opened.
      await server.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      await server.end()
    },
  }
}

// Every migration directory, in the order Prisma applies them.
export function migrationNames(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export function migrationSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
}

// Runs a Prisma CLI command (`migrate deploy`, `db seed`, ...) against the
// given database instead of the one in `.env`.
export function prismaCli(databaseUrl: string, ...args: string[]) {
  return run('npx', ['prisma', ...args], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
}

// Loads a fresh instance of the application, and of the sign-in helper
// bound to it, that reads the given database instead of the shared test
// one. `drop()` restores the environment.
export async function applicationOn(databaseUrl: string) {
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.resetModules()
  // Vitest runs these as ES module imports; the type checker reads them
  // as CommonJS interop, hence the explicit module types.
  const { default: app } = (await import('../../../src/app.js')) as unknown as AppModule
  const { signIn, signInAs } = (await import('./signIn.js')) as unknown as SignInModule

  return { app, signIn, signInAs }
}
