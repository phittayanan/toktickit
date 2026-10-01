import request from 'supertest'
import app from '../../../src/app'
import type { Role } from './roles'

// Meets BR-08, so a helper-made user could also keep it through a change.
export const TEST_PASSWORD = 'Test-Passw0rd!'

export const SESSION_COOKIE = 'tk_session'

// Run-unique so re-running against a non-reset database never collides
// with a previous run's users (the Lab 2 convention).
const RUN_ID = Date.now()
let userCount = 0

export interface TestUser {
  id: number
  name: string
  email: string
  role: Role
  password: string
}

export interface TestUserOptions {
  name?: string
  password?: string
  isActive?: boolean
  mustChangePassword?: boolean
}

interface NewUser {
  name: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
}

// The one step this helper cannot take yet: the User model arrives with
// #46 and bcrypt hashing (BR-07) with #47. It becomes a `prisma.user.create`
// storing the hash of `password`, returning the new id.
async function insertUser(_user: NewUser, _password: string): Promise<number> {
  throw new Error('createUser needs the User model (#46) and bcrypt hashing (#47)')
}

// Creates a user of the given role with a known password, directly in the
// test database. By default the user is active and need not change their
// password, so they can use the application straight after signing in.
export async function createUser(role: Role, options: TestUserOptions = {}): Promise<TestUser> {
  userCount += 1
  const password = options.password ?? TEST_PASSWORD
  const user: NewUser = {
    name: options.name ?? `lab-03 test ${role} ${userCount}`,
    email: `lab03-${RUN_ID}-${userCount}@example.com`,
    role,
    isActive: options.isActive ?? true,
    mustChangePassword: options.mustChangePassword ?? false,
  }

  const id = await insertUser(user, password)

  return { id, name: user.name, email: user.email, role, password }
}

// Signs in through POST /api/auth/login, the only way a test establishes
// identity (tests.md §1), and returns the session cookie to send back with
// `.set('Cookie', cookie)`.
export async function signIn(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password })

  const cookie = res.get('Set-Cookie')?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
  if (res.status !== 200 || !cookie) {
    throw new Error(`Sign-in as ${email} failed with ${res.status}`)
  }

  return cookie.split(';')[0]
}

// Creates a user of the given role and signs them in.
export async function signInAs(role: Role, options: TestUserOptions = {}): Promise<{ user: TestUser; cookie: string }> {
  const user = await createUser(role, options)
  const cookie = await signIn(user.email, user.password)

  return { user, cookie }
}
