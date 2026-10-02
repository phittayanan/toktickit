import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Role } from './users'

// Writes E2E users directly into the test database (docs/lab-03/tests.md
// §1 E2E). Hashing a password and reaching PostgreSQL need the server's
// own dependencies, so the work is done by server/tests/e2e/ensureUsers.ts,
// run from server/ against its DATABASE_URL. It refuses any database whose
// name does not end in `_e2e`.
const SERVER_DIR = path.join(__dirname, '..', '..', '..', 'server')

export interface UserRecord {
  name: string
  email: string
  password: string
  role: Role
  isActive?: boolean
  mustChangePassword?: boolean
}

export function ensureUsers(users: UserRecord[]): { id: number; email: string }[] {
  const output = execFileSync(path.join(SERVER_DIR, 'node_modules', '.bin', 'tsx'), ['tests/e2e/ensureUsers.ts'], {
    cwd: SERVER_DIR,
    input: JSON.stringify(users),
    encoding: 'utf8',
  })

  // The ids are the last line: anything a dependency prints comes before it.
  return JSON.parse(output.trim().split('\n').pop() ?? '[]')
}
