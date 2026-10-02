import { request } from '@playwright/test'
import { API_URL } from './api'
import { ensureUsers } from './database'
import { GLOBAL_SETUP_USERS, createDisposableUser } from './users'

// The suites change and deactivate users through the server, so the server
// has to be using the same dedicated E2E database the users are written to
// (ensureUsers refuses any other). A user created a moment ago, under an
// address no earlier run used, can sign in only if it is.
async function assertServerUsesE2EDatabase() {
  const probe = createDisposableUser('REQUESTER')
  const api = await request.newContext({ baseURL: API_URL })
  try {
    const response = await api.post('/api/auth/login', { data: { email: probe.email, password: probe.password } })
    if (response.status() !== 200) {
      throw new Error(
        `The server at ${API_URL} is not using the E2E database named by DATABASE_URL ` +
          `(sign-in of a user just created there answered ${response.status()}). Start the server with the ` +
          'same DATABASE_URL as this run. See "Running Tests" in README.md.',
      )
    }
  } finally {
    await api.dispose()
  }
}

// docs/lab-03/tests.md §1 E2E: the suites sign in as users this setup
// creates itself, one of each role, never as a seed account and never as
// whatever an earlier run left in the database.
export default async function globalSetup() {
  await assertServerUsesE2EDatabase()
  ensureUsers(GLOBAL_SETUP_USERS)
}
