import { ensureUsers } from './database'
import { GLOBAL_SETUP_USERS } from './users'

// docs/lab-03/tests.md §1 E2E: the suites sign in as users this setup
// creates itself, one of each role, never as a seed account and never as
// whatever an earlier run left in the database.
export default function globalSetup() {
  ensureUsers(GLOBAL_SETUP_USERS)
}
