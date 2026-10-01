import { inspect } from 'node:util'
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import bcrypt from 'bcrypt'
import request, { type Response } from 'supertest'
import app from '../../src/app'
import { resetClock } from '../../src/clock'
import { installFakeClock } from './support/clock'
import prisma from '../../src/prisma'
import { SESSION_COOKIE, TEST_PASSWORD, createUser, signIn, signInAs, type TestUser } from './support/signIn'

// Every login and password change runs bcrypt at cost 12 (BR-07), and
// several tests need a handful of them.
vi.setConfig({ testTimeout: 20_000 })

afterEach(() => {
  resetClock()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// The default CLIENT_ORIGIN (api-spec.md §1.1).
const CLIENT_ORIGIN = 'http://localhost:5173'
const FOREIGN_ORIGIN = 'https://evil.example'

type AppModule = typeof import('../../src/app')
type PrismaModule = typeof import('../../src/prisma')

// A fresh instance of the application started under the given environment.
async function applicationWith(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  // Vitest runs these as ES module imports; the type checker reads them
  // as CommonJS interop, hence the explicit module types.
  const { default: freshApp } = (await import('../../src/app.js')) as unknown as AppModule
  const { default: freshPrisma } = (await import('../../src/prisma.js')) as unknown as PrismaModule

  return { app: freshApp, close: () => freshPrisma.$disconnect() }
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

function login(email: string, password: string) {
  return request(app).post('/api/auth/login').send({ email, password })
}

function me(cookie: string) {
  return request(app).get('/api/auth/me').set('Cookie', cookie)
}

const NEW_PASSWORD = 'Changed-Passw0rd!'

function changePassword(cookie: string, body: object) {
  return request(app).post('/api/auth/change-password').set('Cookie', cookie).send(body)
}

// The `tk_session` Set-Cookie header of a response, or undefined.
function sessionSetCookie(res: Response): string | undefined {
  return res.get('Set-Cookie')?.find((value) => value.startsWith(`${SESSION_COOKIE}=`))
}

describe('POST /api/auth/login', () => {
  // API-01 (AC-01, BR-06)
  it('signs in an active user whose email is typed in mixed case', async () => {
    const user = await createUser('IT_STAFF')

    const res = await login(`  ${user.email.toUpperCase()} `, user.password)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'IT_STAFF',
      mustChangePassword: false,
    })
    // 32 random bytes in base64url (ADR-0007).
    expect(sessionSetCookie(res)).toMatch(/^tk_session=[A-Za-z0-9_-]{43};/)
  })

  // API-02 (AC-05, BR-10)
  it('answers an unknown email, a wrong password, and a user with no password identically', async () => {
    const user = await createUser('REQUESTER')
    const withoutPassword = await createUser('REQUESTER', { hasPassword: false })
    const compare = vi.spyOn(bcrypt, 'compare')

    const attempts = [
      await login(`nobody-${user.email}`, TEST_PASSWORD),
      await login(user.email, 'Wrong-Passw0rd!'),
      await login(withoutPassword.email, TEST_PASSWORD),
    ]

    for (const res of attempts) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' })
      expect(sessionSetCookie(res)).toBeUndefined()
    }
    // A password comparison runs in every case, so timing does not tell
    // them apart (tests.md §7).
    expect(compare).toHaveBeenCalledTimes(attempts.length)
    expect(await prisma.session.count({ where: { userId: { in: [user.id, withoutPassword.id] } } })).toBe(0)
  })

  // API-03 (AC-06, BR-11)
  it('tells an inactive account so only when the password is correct', async () => {
    const user = await createUser('REQUESTER', { isActive: false })

    const correct = await login(user.email, user.password)
    const wrong = await login(user.email, 'Wrong-Passw0rd!')

    expect(correct.status).toBe(403)
    expect(correct.body).toEqual({
      error: 'This account is inactive. Contact an administrator.',
      code: 'ACCOUNT_INACTIVE',
    })
    expect(sessionSetCookie(correct)).toBeUndefined()
    expect(wrong.status).toBe(401)
    expect(wrong.body).toEqual({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' })
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  // API-04 (AC-07, BR-12)
  it.each([
    ['a user', true],
    ['an email that matches no user', false],
  ])('refuses %s for 15 minutes after five failed logins', async (_case, exists) => {
    const clock = installFakeClock(new Date('2026-10-01T00:00:00.000Z'))
    const user = await createUser('REQUESTER')
    const email = exists ? user.email : `nobody-${user.email}`

    // Failures at 0, 1, 2, 3, and 4 minutes; each is itself answered 401.
    for (let failure = 0; failure < 5; failure += 1) {
      if (failure > 0) clock.advance(MINUTE)
      expect((await login(email, 'Wrong-Passw0rd!')).status).toBe(401)
    }

    clock.advance(10 * MINUTE)
    const refused = await login(email, user.password)
    expect(refused.status).toBe(429)
    expect(refused.body).toEqual({
      error: 'Too many failed sign-in attempts. Try again later.',
      code: 'LOGIN_THROTTLED',
    })
    // Five of the fifteen minutes are left.
    expect(refused.get('Retry-After')).toBe('300')
    expect(sessionSetCookie(refused)).toBeUndefined()

    clock.advance(5 * MINUTE)
    expect((await login(email, user.password)).status).toBe(exists ? 200 : 401)
  })

  // BR-12, api-spec.md §2 Throttle
  it('forgets the recorded failures after a successful login', async () => {
    const user = await createUser('REQUESTER')
    const failFourTimes = async () => {
      for (let failure = 0; failure < 4; failure += 1) {
        expect((await login(user.email, 'Wrong-Passw0rd!')).status).toBe(401)
      }
    }

    await failFourTimes()
    expect((await login(user.email, user.password)).status).toBe(200)
    await failFourTimes()

    expect((await login(user.email, user.password)).status).toBe(200)
  })

  // BR-12, api-spec.md §2 Throttle
  it('neither counts nor clears failures when it answers that the account is inactive', async () => {
    const user = await createUser('REQUESTER', { isActive: false })
    const wrong = () => login(user.email, 'Wrong-Passw0rd!')
    const correct = () => login(user.email, user.password)

    for (let failure = 0; failure < 4; failure += 1) await wrong()
    // Not a fifth failure, however often it is repeated.
    expect((await correct()).status).toBe(403)
    expect((await correct()).status).toBe(403)
    // The four failures still stand: this is the fifth.
    expect((await wrong()).status).toBe(401)

    expect((await correct()).status).toBe(429)
  })

  // BR-12: failures that arrive together are all counted.
  it('counts five failed logins sent at the same moment', async () => {
    const user = await createUser('REQUESTER')

    await Promise.all(Array.from({ length: 5 }, () => login(user.email, 'Wrong-Passw0rd!')))

    expect((await login(user.email, user.password)).status).toBe(429)
  })

  // BR-12: a login is counted before its password is checked, so sending
  // them together buys no extra guesses.
  it('checks no more than five passwords among wrong ones sent at the same moment', async () => {
    const user = await createUser('REQUESTER')
    const compare = vi.spyOn(bcrypt, 'compare')

    const attempts = await Promise.all(Array.from({ length: 12 }, (_, guess) => login(user.email, `Wrong-Passw0rd-${guess}!`)))

    const statuses = attempts.map((res) => res.status)
    expect(statuses.filter((status) => status === 401)).toHaveLength(5)
    expect(statuses.filter((status) => status === 429)).toHaveLength(7)
    expect(compare).toHaveBeenCalledTimes(5)
  })

  // BR-12, api-spec.md §2 Throttle
  it('does not let an inactive account\'s correct password, sent with wrong ones, change their count', async () => {
    const user = await createUser('REQUESTER', { isActive: false })
    const wrong = () => login(user.email, 'Wrong-Passw0rd!')

    for (let failure = 0; failure < 3; failure += 1) await wrong()
    const [correct, fourth] = await Promise.all([login(user.email, user.password), wrong()])

    expect(correct.status).toBe(403)
    expect(fourth.status).toBe(401)
    // Four failures stand, not five and not none: one more is the fifth.
    expect((await wrong()).status).toBe(401)
    expect((await wrong()).status).toBe(429)
  })

  // api-spec.md §2: 400, with `field` naming the input.
  it.each([
    ['a missing email', { password: TEST_PASSWORD }, 'email'],
    ['an empty email', { email: '   ', password: TEST_PASSWORD }, 'email'],
    ['an email that is not a string', { email: 42, password: TEST_PASSWORD }, 'email'],
    ['an email longer than 254 characters', { email: `${'a'.repeat(243)}@example.com`, password: TEST_PASSWORD }, 'email'],
    ['a missing password', { email: 'someone@example.com' }, 'password'],
    ['an empty password', { email: 'someone@example.com', password: '' }, 'password'],
    ['a password that is not a string', { email: 'someone@example.com', password: ['x'] }, 'password'],
  ])('rejects %s', async (_case, body, field) => {
    const res = await request(app).post('/api/auth/login').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    expect(sessionSetCookie(res)).toBeUndefined()
  })

  it('accepts an email of exactly 254 characters as input', async () => {
    // Run-unique, so failures recorded by earlier runs never throttle it.
    const email = `${Date.now()}@example.com`.padStart(254, 'a')

    const res = await login(email, TEST_PASSWORD)

    expect(email).toHaveLength(254)
    expect(res.status).toBe(401)
  })
})

const UNAUTHENTICATED = { error: 'You are not signed in.', code: 'UNAUTHENTICATED' }

describe('GET /api/auth/me', () => {
  // API-09 (AC-11, FR-03)
  it('returns only the identity of the signed-in user', async () => {
    const { user, cookie } = await signInAs('ADMINISTRATOR')

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'ADMINISTRATOR',
      mustChangePassword: false,
    })
  })

  // API-09 (AC-11)
  it.each([
    ['no session cookie', undefined],
    ['a session cookie the server never issued', `${SESSION_COOKIE}=not-a-session`],
  ])('refuses %s', async (_case, cookie) => {
    const req = request(app).get('/api/auth/me')

    const res = await (cookie ? req.set('Cookie', cookie) : req)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })
})

describe('session', () => {
  // API-10 (AC-12, BR-13)
  it('lasts while it is used within 8 hours and ends once it is left unused for 8 hours', async () => {
    const clock = installFakeClock(new Date('2026-10-01T00:00:00.000Z'))
    const { cookie } = await signInAs('REQUESTER')
    const me = () => request(app).get('/api/auth/me').set('Cookie', cookie)

    clock.advance(8 * HOUR - 1)
    expect((await me()).status).toBe(200)
    // Almost 16 hours after login: the expiry moved forward on that use.
    clock.advance(8 * HOUR - 1)
    expect((await me()).status).toBe(200)

    clock.advance(8 * HOUR)
    const expired = await me()
    expect(expired.status).toBe(401)
    expect(expired.body).toEqual(UNAUTHENTICATED)
  })

  // BR-01, ADR-0007: activation is read from the user on every request.
  it('ends for a user who has been made inactive', async () => {
    const { user, cookie } = await signInAs('IT_STAFF')

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })
})

describe('POST /api/auth/logout', () => {
  // API-08 (AC-10, BR-14)
  it('ends the session at once and is safe to repeat', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    const logout = () => request(app).post('/api/auth/logout')

    const res = await logout().set('Cookie', cookie)

    expect(res.status).toBe(204)
    expect(sessionSetCookie(res)).toMatch(/^tk_session=;.*Max-Age=0/)
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)

    const replay = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(replay.status).toBe(401)
    expect(replay.body).toEqual(UNAUTHENTICATED)

    expect((await logout().set('Cookie', cookie)).status).toBe(204)
    expect((await logout()).status).toBe(204)
  })
})

describe('session cookie', () => {
  // API-11 (AC-13, BR-13, api-spec.md §1.2)
  it('is HttpOnly and SameSite=Strict, with no lifetime, and its value appears in no body', async () => {
    const user = await createUser('REQUESTER')

    const res = await login(user.email, user.password)

    const [pair, ...attributes] = sessionSetCookie(res)!.split('; ')
    expect(attributes.sort()).toEqual(['HttpOnly', 'Path=/', 'SameSite=Strict'])
    expect(res.text).not.toContain(pair.split('=')[1])
  })

  // api-spec.md §1.2, ADR-0007
  it('is also Secure in production', async () => {
    const user = await createUser('REQUESTER')
    const production = await applicationWith({ NODE_ENV: 'production' })

    const res = await request(production.app).post('/api/auth/login').send({ email: user.email, password: user.password })
    await production.close()

    expect(sessionSetCookie(res)!.split('; ').slice(1).sort()).toEqual(['HttpOnly', 'Path=/', 'SameSite=Strict', 'Secure'])
  })

  // api-spec.md §2, ADR-0007: no session fixation.
  it('carries a new value at every login, even when the request brought a session', async () => {
    const { user, cookie } = await signInAs('REQUESTER')

    const res = await login(user.email, user.password).set('Cookie', cookie)

    const again = sessionSetCookie(res)!.split(';')[0]
    expect(again).not.toBe(cookie)
    // Both sessions are live: the first was not reused or replaced.
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)
    expect((await request(app).get('/api/auth/me').set('Cookie', again)).status).toBe(200)
  })
})

describe('Origin check', () => {
  const ORIGIN_NOT_ALLOWED = { error: 'This origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' }

  // API-11 (AC-13, BR-15, api-spec.md §1.3)
  it('rejects a login from a foreign Origin before anything else', async () => {
    const user = await createUser('REQUESTER')

    const res = await login(user.email, user.password).set('Origin', FOREIGN_ORIGIN)

    expect(res.status).toBe(403)
    expect(res.body).toEqual(ORIGIN_NOT_ALLOWED)
    expect(sessionSetCookie(res)).toBeUndefined()
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  // API-11 (AC-13, BR-15)
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects a %s from a foreign Origin, whatever the path',
    async (method) => {
      const res = await request(app)[method]('/api/auth/logout').set('Origin', FOREIGN_ORIGIN)

      expect(res.status).toBe(403)
      expect(res.body).toEqual(ORIGIN_NOT_ALLOWED)
    },
  )

  // API-11 (AC-13)
  it('lets a state-changing request from the client origin through', async () => {
    const user = await createUser('REQUESTER')

    const res = await login(user.email, user.password).set('Origin', CLIENT_ORIGIN)

    expect(res.status).toBe(200)
  })

  // api-spec.md §1.3: the rule is about state-changing methods only.
  it('does not reject a GET from a foreign Origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', FOREIGN_ORIGIN)

    expect(res.status).toBe(200)
  })

  // api-spec.md §1.1: the one allowed origin is CLIENT_ORIGIN.
  it('allows the configured CLIENT_ORIGIN instead of the default', async () => {
    const configured = await applicationWith({ CLIENT_ORIGIN: 'https://tickets.example' })
    const logout = (origin: string) => request(configured.app).post('/api/auth/logout').set('Origin', origin)

    expect((await logout('https://tickets.example')).status).toBe(204)
    expect((await logout(CLIENT_ORIGIN)).status).toBe(403)
    await configured.close()
  })
})

describe('CORS', () => {
  // api-spec.md §1.1: exactly one origin, with credentials; no wildcard.
  it.each([CLIENT_ORIGIN, FOREIGN_ORIGIN])('allows only the client origin, with credentials, when asked by %s', async (origin) => {
    const preflight = await request(app)
      .options('/api/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
    const simple = await request(app).get('/api/health').set('Origin', origin)

    for (const res of [preflight, simple]) {
      expect(res.get('Access-Control-Allow-Origin')).toBe(CLIENT_ORIGIN)
      expect(res.get('Access-Control-Allow-Credentials')).toBe('true')
    }
  })
})

describe('unexpected failure', () => {
  // API-12 (AC-52, BR-49, BR-07)
  it('answers a login the database cannot serve with the generic body and logs no password', async () => {
    const unreachable = new URL(process.env.DATABASE_URL as string)
    unreachable.pathname = '/toktickit_no_such_database'
    const broken = await applicationWith({ DATABASE_URL: unreachable.toString() })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(broken.app)
      .post('/api/auth/login')
      .send({ email: 'someone@example.com', password: TEST_PASSWORD })
    await broken.close()

    expect(res.status).toBe(500)
    expect(res.type).toBe('application/json')
    // Nothing but the generic text: no stack trace, SQL, or file path.
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' })
    expect(logged).toHaveBeenCalled()
    expect(inspect(logged.mock.calls, { depth: 6 })).not.toContain(TEST_PASSWORD)
  })

})

describe('request body', () => {
  // api-spec.md §1.4: malformed input is the client's error, not a failure.
  it('that is not JSON is answered 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The request body is not valid JSON.', code: 'VALIDATION_ERROR' })
  })

  // api-spec.md §1.4: a body the server will not read is the client's
  // error too, and the one status the contract gives VALIDATION_ERROR is
  // 400.
  it.each([
    ['larger than the limit', 'application/json', JSON.stringify({ email: 'a'.repeat(200_000) })],
    ['in a charset the server does not read', 'application/json; charset=latin1', '{}'],
  ])('that is %s is answered 400', async (_case, contentType, body) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).post('/api/auth/login').set('Content-Type', contentType).send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR' })
    expect(logged).not.toHaveBeenCalled()
  })
})

describe('request path', () => {
  // api-spec.md §1.4: malformed input is the client's error, not a failure.
  it('with a parameter that cannot be decoded is answered 400', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).get('/api/tickets/%E0%A4%A')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The request is malformed.', code: 'VALIDATION_ERROR' })
    expect(logged).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/change-password', () => {
  // API-07 (AC-09, BR-09)
  it('saves a valid new password, renews the session, and ends the other sessions', async () => {
    const user = await createUser('REQUESTER', { mustChangePassword: true })
    const cookie = await signIn(user.email, user.password)
    const elsewhere = await signIn(user.email, user.password)

    const res = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'REQUESTER',
      mustChangePassword: false,
    })
    const [renewed, ...attributes] = sessionSetCookie(res)!.split('; ')
    expect(renewed).not.toBe(cookie)
    expect(attributes.sort()).toEqual(['HttpOnly', 'Path=/', 'SameSite=Strict'])

    // The current session continues under the new value only.
    const continued = await me(renewed)
    expect(continued.status).toBe(200)
    expect(continued.body.mustChangePassword).toBe(false)
    expect((await me(cookie)).status).toBe(401)
    expect((await me(elsewhere)).status).toBe(401)

    expect((await login(user.email, user.password)).status).toBe(401)
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200)
  })

  // BR-08, specification.md §11 item 2: bcrypt reads 72 bytes, so a longer
  // input must not pass as the 72-byte password it starts with.
  it('saves a 72-character password that only its exact text then signs in', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    const longest = 'Ab1!' + 'a'.repeat(68)

    const res = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: longest,
      confirmPassword: longest,
    })

    expect(res.status).toBe(200)
    expect((await login(user.email, `${longest}x`)).status).toBe(401)
    expect((await login(user.email, longest)).status).toBe(200)
  })

  describe('with an input it rejects', () => {
    let user: TestUser
    let cookie: string

    beforeAll(async () => {
      user = await createUser('IT_STAFF', { mustChangePassword: true })
      cookie = await signIn(user.email, user.password)
    })

    const valid = { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }
    const newPassword = (password: unknown) => ({ ...valid, newPassword: password, confirmPassword: password })

    // API-06 (AC-08, BR-08, BR-09)
    it.each([
      ['no current password', { ...valid, currentPassword: undefined }, 'currentPassword', 'Current password is required.'],
      ['a current password that is not a string', { ...valid, currentPassword: 7 }, 'currentPassword', 'Current password is required.'],
      ['a wrong current password', { ...valid, currentPassword: 'Wrong-Passw0rd!' }, 'currentPassword', 'Current password is incorrect.'],
      ['no new password', { ...valid, newPassword: undefined }, 'newPassword', 'New password is required.'],
      ['a new password of 7 characters', newPassword('Abcde1!'), 'newPassword', 'Password must be at least 8 characters.'],
      ['a new password of 73 characters', newPassword('Ab1!' + 'a'.repeat(69)), 'newPassword', 'Password must be at most 72 characters.'],
      // 'é' is one character and two bytes: 72 characters, 73 bytes.
      ['a new password over 72 bytes', newPassword('Ab1!é' + 'a'.repeat(67)), 'newPassword', 'Password must be at most 72 bytes.'],
      ['a new password with no upper-case letter', newPassword('changed-passw0rd!'), 'newPassword', 'Password must include an upper-case letter.'],
      ['a new password with no lower-case letter', newPassword('CHANGED-PASSW0RD!'), 'newPassword', 'Password must include a lower-case letter.'],
      ['a new password with no digit', newPassword('Changed-Password!'), 'newPassword', 'Password must include a number.'],
      ['a new password with no special character', newPassword('ChangedPassw0rd'), 'newPassword', 'Password must include a special character.'],
      ['the current password again', newPassword(TEST_PASSWORD), 'newPassword', 'New password must differ from the current password.'],
      ['no confirmation', { ...valid, confirmPassword: undefined }, 'confirmPassword', 'Confirm the new password.'],
      ['a confirmation that differs', { ...valid, confirmPassword: `${NEW_PASSWORD}x` }, 'confirmPassword', 'Confirmation does not match the new password.'],
    ])('rejects %s and changes nothing', async (_case, body, field, error) => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })

      const res = await changePassword(cookie, body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error, code: 'VALIDATION_ERROR', field })
      // The password hash and the must-change flag are as they were, and
      // the session goes on under the value it had.
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before)
      expect(sessionSetCookie(res)).toBeUndefined()
      expect((await me(cookie)).body.mustChangePassword).toBe(true)
    })
  })

  // api-spec.md §2: any signed-in user, so not without a session.
  it('refuses a request with no session', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })
})

// The Lab 2 routes come under the session in #48, so until then the
// protected endpoint here is one the contract answers for any path
// (api-spec.md §1.4): an /api path it does not define.
describe('a path the API does not define', () => {
  const undefinedPath = () => request(app).get('/api/no-such-resource')

  // api-spec.md §1.4
  it('is 401 with no session and 404 with one', async () => {
    const { cookie } = await signInAs('REQUESTER')

    const signedOut = await undefinedPath()
    const signedIn = await undefinedPath().set('Cookie', cookie)

    expect(signedOut.status).toBe(401)
    expect(signedOut.body).toEqual(UNAUTHENTICATED)
    expect(signedIn.status).toBe(404)
    expect(signedIn.body).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
  })
})

describe('a user who must change their password', () => {
  // API-05 (AC-02, BR-02, FR-04)
  it('reaches only the current user, change password, and logout until a new password is saved', async () => {
    const user = await createUser('ADMINISTRATOR', { mustChangePassword: true })
    const cookie = await signIn(user.email, user.password)
    const protectedEndpoint = (session: string) => request(app).get('/api/no-such-resource').set('Cookie', session)

    const refused = await protectedEndpoint(cookie)
    expect(refused.status).toBe(403)
    expect(refused.body).toEqual({
      error: 'You must change your password to continue.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    })

    const identity = await me(cookie)
    expect(identity.status).toBe(200)
    expect(identity.body.mustChangePassword).toBe(true)

    const changed = await changePassword(cookie, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    })
    expect(changed.status).toBe(200)

    // The application is open to them now: the answer is the path's own.
    const renewed = sessionSetCookie(changed)!.split(';')[0]
    expect((await protectedEndpoint(renewed)).status).toBe(404)
  })

  // BR-02: logout stays available.
  it('can still log out', async () => {
    const user = await createUser('REQUESTER', { mustChangePassword: true })
    const cookie = await signIn(user.email, user.password)

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie)

    expect(res.status).toBe(204)
    expect((await me(cookie)).status).toBe(401)
  })
})

describe('caching', () => {
  // api-spec.md §1.6
  it('is forbidden for every authentication response', async () => {
    const { user, cookie } = await signInAs('REQUESTER')

    const responses = [
      await login(user.email, user.password),
      await login(user.email, 'Wrong-Passw0rd!'),
      await me(cookie),
      await request(app).get('/api/auth/me'),
      await changePassword(cookie, {}),
      await request(app).post('/api/auth/logout').set('Cookie', cookie),
    ]

    for (const res of responses) {
      expect(res.get('Cache-Control'), `${res.status}`).toBe('no-store')
    }
  })
})
