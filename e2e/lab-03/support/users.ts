// The users the Lab 3 E2E suites sign in as (docs/lab-03/tests.md §1 E2E).
// Seed accounts must change their password once and the seed never resets
// it, so E2E never signs in as them: a global setup (#54) creates these
// directly in the test database, already past the password change. The
// `e2e.` email prefix marks them as test data.
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
