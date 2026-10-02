// The users the Lab 3 E2E suites sign in as (docs/lab-03/tests.md §1 E2E).
// Seed accounts must change their password once and the seed never resets
// it, so E2E never signs in as them: a global setup (#54) creates these
// directly in the test database, already past the password change. The
// `e2e.` email prefix marks them as test data.
import { ensureUsers } from './database'

export type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'

export interface E2EUser {
  name: string
  email: string
  password: string
  role: Role
  // Where the role lands after signing in (ui-spec.md §4.1).
  landingPath: string
}

// Meets BR-08. Local test data only, never a real credential.
const E2E_PASSWORD = 'E2e-Passw0rd!'

export const E2E_USERS: Record<Role, E2EUser> = {
  REQUESTER: {
    name: 'E2E Requester',
    email: 'e2e.requester@kmutt.ac.th',
    password: E2E_PASSWORD,
    role: 'REQUESTER',
    landingPath: '/tickets',
  },
  IT_STAFF: {
    name: 'E2E IT Staff',
    email: 'e2e.it-staff@kmutt.ac.th',
    password: E2E_PASSWORD,
    role: 'IT_STAFF',
    landingPath: '/staff/queue',
  },
  ADMINISTRATOR: {
    name: 'E2E Administrator',
    email: 'e2e.administrator@kmutt.ac.th',
    password: E2E_PASSWORD,
    role: 'ADMINISTRATOR',
    landingPath: '/admin/users',
  },
}

// A second Requester, for the flows that need two distinct identities.
export const E2E_SECOND_REQUESTER: E2EUser = {
  name: 'E2E Second Requester',
  email: 'e2e.requester-2@kmutt.ac.th',
  password: E2E_PASSWORD,
  role: 'REQUESTER',
  landingPath: '/tickets',
}

// Every user the global setup creates before any spec runs.
export const GLOBAL_SETUP_USERS: E2EUser[] = [...Object.values(E2E_USERS), E2E_SECOND_REQUESTER]

const LANDING_PATHS: Record<Role, string> = {
  REQUESTER: '/tickets',
  IT_STAFF: '/staff/queue',
  ADMINISTRATOR: '/admin/users',
}

export interface DisposableUser extends E2EUser {
  id: number
}

export interface DisposableUserOptions {
  isActive?: boolean
  mustChangePassword?: boolean
}

let disposableUserCount = 0

// A user for one test only, for a flow that changes the account it uses:
// a password change, a new initial password, a role change, a deactivation,
// or failed logins. The users above are shared by every spec and are only
// ever signed in as. The address is unique to this call, so a retry or a
// later run never meets an account an earlier one used up.
export function createDisposableUser(role: Role, options: DisposableUserOptions = {}): DisposableUser {
  disposableUserCount += 1
  const tag = `${Date.now()}-${process.pid}-${disposableUserCount}`
  const user: E2EUser = {
    name: `E2E Disposable ${tag}`,
    email: `e2e.disposable.${tag}@kmutt.ac.th`,
    password: E2E_PASSWORD,
    role,
    landingPath: LANDING_PATHS[role],
  }
  const [{ id }] = ensureUsers([{ ...user, ...options }])

  return { ...user, id }
}
