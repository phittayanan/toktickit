import request from 'supertest'
import app from '../../../src/app'
import prisma from '../../../src/prisma'
import { hashPassword } from '../../../src/services/passwordHash.service'
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

interface NewUser {
  name: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
}

async function insertUser(user: NewUser, password: string): Promise<number> {
  const created = await prisma.user.create({
    data: { ...user, passwordHash: await hashPassword(password) },
  })

  return created.id
}

// Creates a user of the given role with a known password, directly in the
// test database. The user is active and need not change their password,
// so they can use the application straight after signing in.
export async function createUser(role: Role): Promise<TestUser> {
  userCount += 1
  const user: NewUser = {
    name: `lab-03 test ${role} ${userCount}`,
    email: `lab03-${RUN_ID}-${userCount}@example.com`,
    role,
    isActive: true,
    mustChangePassword: false,
  }

  const id = await insertUser(user, TEST_PASSWORD)

  return { id, name: user.name, email: user.email, role, password: TEST_PASSWORD }
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
export async function signInAs(role: Role): Promise<{ user: TestUser; cookie: string }> {
  const user = await createUser(role)
  const cookie = await signIn(user.email, user.password)

  return { user, cookie }
}
