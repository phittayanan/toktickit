import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Client } from 'pg'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { createUser, signInAs } from './support/signIn'
import {
  applicationOn,
  createThrowawayDatabase,
  prismaCli,
  type ThrowawayDatabase,
} from './support/throwawayDatabase'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 })

// Run-unique, so a search for it finds only the users this run made (the
// test database is shared and never reset).
const RUN = `ua${Date.now()}`

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

let administrator: Awaited<ReturnType<typeof signInAs>>

beforeAll(async () => {
  administrator = await signInAs('ADMINISTRATOR')
})

function asAdministrator(method: 'get' | 'post' | 'patch', path: string) {
  return request(app)[method](path).set('Cookie', administrator.cookie)
}

// Gives a helper-made user a name and email this file chooses.
async function named(userId: number, name: string, email: string) {
  await prisma.user.update({ where: { id: userId }, data: { name, email } })
}

describe('GET /api/admin/users', () => {
  // API-46 (AC-40, FR-21)
  it('lists every user, active and inactive, ordered by name then id, as AdminUser with no hash', async () => {
    const charlie = await createUser('IT_STAFF', { isActive: false })
    const alpha = await createUser('REQUESTER', { hasPassword: false, mustChangePassword: true })
    const bravoLater = await createUser('ADMINISTRATOR')
    const bravoEarlier = await createUser('REQUESTER')
    await named(charlie.id, `${RUN} list Charlie`, `${RUN}.list.charlie@example.com`)
    await named(alpha.id, `${RUN} list Alpha`, `${RUN}.list.alpha@example.com`)
    // Two users of one name are ordered by id; the later-created row is
    // given the smaller position only if the order ignored the id.
    await named(bravoLater.id, `${RUN} list Bravo`, `${RUN}.list.bravo2@example.com`)
    await named(bravoEarlier.id, `${RUN} list Bravo`, `${RUN}.list.bravo1@example.com`)

    const res = await asAdministrator('get', '/api/admin/users')

    expect(res.status).toBe(200)
    const mine = res.body.filter((user: { name: string }) => user.name.startsWith(`${RUN} list `))
    expect(mine.map((user: { id: number }) => user.id)).toEqual(
      [alpha.id, ...[bravoLater.id, bravoEarlier.id].sort((a, b) => a - b), charlie.id],
    )
    expect(mine[0]).toEqual({
      id: alpha.id,
      name: `${RUN} list Alpha`,
      email: `${RUN}.list.alpha@example.com`,
      role: 'REQUESTER',
      isActive: true,
      mustChangePassword: true,
      hasPassword: false,
      ownedUnfinishedTicketCount: 0,
      createdAt: expect.stringMatching(ISO_TIMESTAMP),
      updatedAt: expect.stringMatching(ISO_TIMESTAMP),
    })
    expect(mine[3]).toMatchObject({ id: charlie.id, role: 'IT_STAFF', isActive: false, hasPassword: true })

    // The signed-in Administrator is listed too, and nobody is left out.
    expect(res.body.map((user: { id: number }) => user.id)).toContain(administrator.user.id)
    expect(res.body).toHaveLength(await prisma.user.count())
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/)
  })

  // api-spec.md §1.6: every /api/admin response, a refusal included.
  it('is never cached, whether it answers or refuses', async () => {
    const itStaff = await signInAs('IT_STAFF')

    const answers = [
      await asAdministrator('get', '/api/admin/users'),
      await request(app).get('/api/admin/users'),
      await request(app).get('/api/admin/users').set('Cookie', itStaff.cookie),
      await asAdministrator('get', '/api/admin/no-such-resource'),
    ]

    expect(answers.map((res) => res.status)).toEqual([200, 401, 403, 404])
    for (const res of answers) {
      expect(res.get('Cache-Control'), String(res.status)).toBe('no-store')
    }
  })

  // API-47 (AC-40, FR-21)
  describe('search and role filter', () => {
    let somsri: number
    let somchai: number
    let wichai: number

    beforeAll(async () => {
      somsri = (await createUser('REQUESTER')).id
      somchai = (await createUser('IT_STAFF')).id
      wichai = (await createUser('IT_STAFF', { isActive: false })).id
      await named(somsri, `${RUN} find Somsri Kaewta`, `${RUN}.find.somsri@example.com`)
      await named(somchai, `${RUN} find Somchai Jaidee`, `${RUN}.find.helpdesk-one@example.com`)
      await named(wichai, `${RUN} find Wichai Phromma`, `${RUN}.find.helpdesk-two@example.com`)
    })

    const ids = (res: request.Response) => res.body.map((user: { id: number }) => user.id)
    const find = (query: Record<string, string>) => asAdministrator('get', '/api/admin/users').query(query)

    it('matches a part of the name in any letter case', async () => {
      const res = await find({ search: `${RUN.toUpperCase()} FIND SOM` })

      expect(res.status).toBe(200)
      expect(ids(res)).toEqual([somchai, somsri])
    })

    it('matches a part of the email in any letter case, active or not', async () => {
      const res = await find({ search: `  ${RUN}.Find.HELPDESK  ` })

      expect(res.status).toBe(200)
      expect(ids(res)).toEqual([somchai, wichai])
    })

    it('ignores an empty or whitespace-only search', async () => {
      const everyone = ids(await find({}))

      expect(ids(await find({ search: '' }))).toEqual(everyone)
      expect(ids(await find({ search: '   ' }))).toEqual(everyone)
    })

    it('treats % and _ in a search as the characters they are', async () => {
      expect(ids(await find({ search: `${RUN} find %` }))).toEqual([])
      expect(ids(await find({ search: `${RUN}_find` }))).toEqual([])
    })

    it('lists only the users of the role asked for', async () => {
      const res = await find({ role: 'IT_STAFF' })

      expect(res.status).toBe(200)
      expect(new Set(res.body.map((user: { role: string }) => user.role))).toEqual(new Set(['IT_STAFF']))
      expect(ids(res)).toEqual(expect.arrayContaining([somchai, wichai]))
      expect(ids(res)).not.toContain(somsri)
    })

    it('combines the search and the role filter', async () => {
      const res = await find({ search: `${RUN} find som`, role: 'IT_STAFF' })

      expect(ids(res)).toEqual([somchai])
    })

    it('ignores a parameter the contract does not name', async () => {
      const res = await find({ search: `${RUN} find wichai`, isActive: 'true', page: '9' })

      expect(res.status).toBe(200)
      expect(ids(res)).toEqual([wichai])
    })

    it.each([
      { name: 'a role that is not a Role', query: 'role=MANAGER', field: 'role' },
      { name: 'a role in another letter case', query: 'role=it_staff', field: 'role' },
      { name: 'an empty role', query: 'role=', field: 'role' },
      { name: 'a repeated role', query: 'role=IT_STAFF&role=REQUESTER', field: 'role' },
      { name: 'a search of 101 characters', query: `search=${'a'.repeat(101)}`, field: 'search' },
      { name: 'a repeated search', query: 'search=a&search=b', field: 'search' },
    ])('answers 400 naming the parameter for $name', async ({ query, field }) => {
      const res = await asAdministrator('get', `/api/admin/users?${query}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    })

    it('accepts a search of exactly 100 characters', async () => {
      const res = await find({ search: 'a'.repeat(100) })

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })
})

const INITIAL_PASSWORD = /^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$/

let newUserCount = 0

// A valid POST /api/admin/users body with an email no user has.
function newUserBody(overrides: Record<string, unknown> = {}) {
  newUserCount += 1
  return {
    name: `${RUN} new User ${newUserCount}`,
    email: `${RUN}.new.${newUserCount}@example.com`,
    role: 'IT_STAFF',
    ...overrides,
  }
}

// An email of exactly `length` characters.
function emailOfLength(length: number) {
  const domain = `@${RUN}.${'d'.repeat(60)}.${'e'.repeat(60)}.${'f'.repeat(60)}.example.com`
  return `${'a'.repeat(length - domain.length)}${domain}`
}

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password })

describe('POST /api/admin/users', () => {
  // API-48 (AC-41, BR-38)
  it('creates the user with a generated initial password, returned once, that they must change', async () => {
    const res = await asAdministrator('post', '/api/admin/users').send({
      name: `  ${RUN} new Alex Thompson  `,
      email: `  ${RUN}.New.Alex@Example.COM `,
      role: 'IT_STAFF',
    })

    expect(res.status).toBe(201)
    expect(res.get('Cache-Control')).toBe('no-store')
    expect(res.body).toEqual({
      user: {
        id: expect.any(Number),
        name: `${RUN} new Alex Thompson`,
        email: `${RUN}.new.alex@example.com`,
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: true,
        hasPassword: true,
        ownedUnfinishedTicketCount: 0,
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
        updatedAt: expect.stringMatching(ISO_TIMESTAMP),
      },
      initialPassword: expect.stringMatching(INITIAL_PASSWORD),
    })

    // The new user signs in with it and can do nothing until they change it.
    const signedIn = await login(`${RUN}.new.alex@example.com`, res.body.initialPassword)
    expect(signedIn.status).toBe(200)
    expect(signedIn.body).toEqual({
      id: res.body.user.id,
      name: `${RUN} new Alex Thompson`,
      email: `${RUN}.new.alex@example.com`,
      role: 'IT_STAFF',
      mustChangePassword: true,
    })
    const cookie = signedIn.get('Set-Cookie')![0].split(';')[0]
    const blocked = await request(app).get('/api/categories').set('Cookie', cookie)
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')

    // It cannot be retrieved again, and is stored only as a bcrypt hash.
    const listed = await asAdministrator('get', '/api/admin/users').query({ search: `${RUN}.new.alex` })
    expect(JSON.stringify(listed.body)).not.toContain(res.body.initialPassword)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } })
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/)
  })

  it('generates a different initial password for each user', async () => {
    const first = await asAdministrator('post', '/api/admin/users').send(newUserBody())
    const second = await asAdministrator('post', '/api/admin/users').send(newUserBody())

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body.initialPassword).not.toBe(first.body.initialPassword)
  })

  it('creates an inactive user when isActive is false, who cannot sign in', async () => {
    const body = newUserBody({ role: 'REQUESTER', isActive: false })

    const res = await asAdministrator('post', '/api/admin/users').send(body)

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ role: 'REQUESTER', isActive: false, mustChangePassword: true })
    const refused = await login(body.email, res.body.initialPassword)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('ACCOUNT_INACTIVE')
  })

  // The system generates the password (BR-38); the Administrator never
  // chooses one.
  it.each(['Chosen-Passw0rd!', '', null])('rejects a `password` key (%j) and creates nobody', async (password) => {
    const body = newUserBody({ password })

    const res = await asAdministrator('post', '/api/admin/users').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'password' })
    expect(await prisma.user.findUnique({ where: { email: body.email } })).toBeNull()
  })

  // API-49 (AC-42, BR-43)
  it.each([
    { name: 'a missing name', change: { name: undefined }, field: 'name' },
    { name: 'a name that is not text', change: { name: 42 }, field: 'name' },
    { name: 'a name of 1 character', change: { name: 'A' }, field: 'name' },
    { name: 'a name of 1 character after trimming', change: { name: '  A  ' }, field: 'name' },
    { name: 'a name of 101 characters', change: { name: 'N'.repeat(101) }, field: 'name' },
    { name: 'a missing email', change: { email: undefined }, field: 'email' },
    { name: 'an email that is not text', change: { email: 42 }, field: 'email' },
    { name: 'an email with no @', change: { email: 'alex.example.com' }, field: 'email' },
    { name: 'an email with no domain', change: { email: 'alex@' }, field: 'email' },
    { name: 'an email with a space', change: { email: 'alex thompson@example.com' }, field: 'email' },
    { name: 'an email of 255 characters', change: { email: emailOfLength(255) }, field: 'email' },
    { name: 'a missing role', change: { role: undefined }, field: 'role' },
    { name: 'a role that is not a Role', change: { role: 'MANAGER' }, field: 'role' },
    { name: 'a list of roles', change: { role: ['IT_STAFF', 'ADMINISTRATOR'] }, field: 'role' },
    { name: 'an isActive that is text', change: { isActive: 'true' }, field: 'isActive' },
    { name: 'an isActive that is null', change: { isActive: null }, field: 'isActive' },
  ])('answers 400 naming the field for $name, and creates nobody', async ({ change, field }) => {
    const valid = newUserBody()
    const body = { ...valid, ...change }

    const res = await asAdministrator('post', '/api/admin/users').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    expect(await prisma.user.findUnique({ where: { email: valid.email } })).toBeNull()
  })

  it('answers 400 for a body that is not an object of fields', async () => {
    for (const body of [undefined, [], 'name']) {
      const res = await asAdministrator('post', '/api/admin/users').send(body as object | undefined)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    }
  })

  it('accepts a name of 2 and of 100 characters, and an email of 254', async () => {
    const answers = [
      await asAdministrator('post', '/api/admin/users').send(newUserBody({ name: 'Al' })),
      await asAdministrator('post', '/api/admin/users').send(newUserBody({ name: 'N'.repeat(100) })),
      await asAdministrator('post', '/api/admin/users').send(newUserBody({ email: emailOfLength(254) })),
    ]

    expect(answers.map((res) => res.status)).toEqual([201, 201, 201])
  })

  // API-49 (AC-42, BR-06)
  it('answers 409 EMAIL_TAKEN for the email of another user, active or not, in any letter case', async () => {
    const active = await createUser('REQUESTER')
    const inactive = await createUser('REQUESTER', { isActive: false })
    const users = await prisma.user.count()

    for (const taken of [active.email.toUpperCase(), `  ${inactive.email}  `]) {
      const res = await asAdministrator('post', '/api/admin/users').send(newUserBody({ email: taken }))

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: 'A user with this email already exists.', code: 'EMAIL_TAKEN', field: 'email' })
    }
    expect(await prisma.user.count()).toBe(users)
  })

  // api-spec.md §1.5: validation is reported before EMAIL_TAKEN.
  it('answers the 400 before the 409 when the body is invalid and the email is taken', async () => {
    const existing = await createUser('REQUESTER')

    const res = await asAdministrator('post', '/api/admin/users').send(newUserBody({ email: existing.email, role: 'MANAGER' }))

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('role')
  })
})

// An id no row has.
const NONEXISTENT_ID = 999999999

const USER_NOT_FOUND = { error: 'User not found', code: 'NOT_FOUND' }

const patchUser = (userId: number | string, body?: object) =>
  asAdministrator('patch', `/api/admin/users/${userId}`).send(body)

// What the list says about one user, which is where an Administrator sees
// a saved change (AC-43).
async function listed(userId: number) {
  const res = await asAdministrator('get', '/api/admin/users')

  return res.body.find((user: { id: number }) => user.id === userId)
}

describe('PATCH /api/admin/users/:id', () => {
  // API-50 (AC-43, FR-23)
  it('saves a new name alone and leaves the rest as it was', async () => {
    const target = await createUser('REQUESTER')
    const before = await listed(target.id)

    const res = await patchUser(target.id, { name: `  ${RUN} edit Renamed  ` })

    expect(res.status).toBe(200)
    expect(res.get('Cache-Control')).toBe('no-store')
    expect(res.body).toEqual({
      user: { ...before, name: `${RUN} edit Renamed`, updatedAt: expect.stringMatching(ISO_TIMESTAMP) },
      unassignedTicketCount: 0,
    })
    expect(new Date(res.body.user.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime())
    expect(await listed(target.id)).toEqual(res.body.user)
  })

  it('saves a new email, lower-cased, which the user then signs in with', async () => {
    const target = await createUser('REQUESTER')

    const res = await patchUser(target.id, { email: `  ${RUN}.Edit.Moved@Example.COM ` })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: target.id, name: target.name, email: `${RUN}.edit.moved@example.com` })
    expect((await login(`${RUN}.edit.moved@example.com`, target.password)).status).toBe(200)
    expect((await login(target.email, target.password)).status).toBe(401)
  })

  it('saves a new role alone', async () => {
    const target = await createUser('REQUESTER')

    const res = await patchUser(target.id, { role: 'ADMINISTRATOR' })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: target.id, name: target.name, email: target.email, role: 'ADMINISTRATOR' })
    expect(await listed(target.id)).toMatchObject({ role: 'ADMINISTRATOR', isActive: true })
  })

  it('deactivates and reactivates a user', async () => {
    const target = await createUser('IT_STAFF')

    const deactivated = await patchUser(target.id, { isActive: false })

    expect(deactivated.status).toBe(200)
    expect(deactivated.body.user).toMatchObject({ id: target.id, role: 'IT_STAFF', isActive: false })
    expect((await login(target.email, target.password)).body.code).toBe('ACCOUNT_INACTIVE')

    const reactivated = await patchUser(target.id, { isActive: true })

    expect(reactivated.status).toBe(200)
    expect(reactivated.body.user).toMatchObject({ id: target.id, isActive: true })
    expect((await login(target.email, target.password)).status).toBe(200)
  })

  it('saves name, email, role, and activation together', async () => {
    const target = await createUser('REQUESTER')
    const change = { name: `${RUN} edit All Four`, email: `${RUN}.edit.all4@example.com`, role: 'IT_STAFF', isActive: false }

    const res = await patchUser(target.id, change)

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: target.id, ...change })
    expect(await listed(target.id)).toMatchObject(change)
  })

  it("accepts the user's own email again, in any letter case", async () => {
    const target = await createUser('REQUESTER')

    const res = await patchUser(target.id, { email: target.email.toUpperCase(), name: `${RUN} edit Same Email` })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email: target.email, name: `${RUN} edit Same Email` })
  })

  it('answers 400 for an empty body, and for one that names none of the four fields', async () => {
    const target = await createUser('REQUESTER')
    const before = await listed(target.id)

    for (const body of [undefined, {}, { id: 1, mustChangePassword: false }]) {
      const res = await patchUser(target.id, body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR' })
    }
    expect(await listed(target.id)).toEqual(before)
  })

  it.each([NONEXISTENT_ID, 0, -1, '1.5', 'abc', '99999999999999999999'])(
    'answers 404 for an id no user has (%s)',
    async (id) => {
      const res = await patchUser(id, { name: 'Nobody Here' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual(USER_NOT_FOUND)
    },
  )

  // api-spec.md §1.5: the resource lookup (step 4) comes before the body
  // is read or validated (step 5).
  it('answers the 404 before the 400 for an unknown id with an invalid or unreadable body', async () => {
    const invalid = await patchUser(NONEXISTENT_ID, { name: '' })
    const unreadable = await asAdministrator('patch', `/api/admin/users/${NONEXISTENT_ID}`)
      .set('Content-Type', 'application/json')
      .send('{"name": ')

    for (const res of [invalid, unreadable]) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(USER_NOT_FOUND)
    }
  })

  // API-49 (AC-42, BR-43)
  it.each([
    { name: 'a name of 1 character', change: { name: 'A' }, field: 'name' },
    { name: 'a name of 101 characters', change: { name: 'N'.repeat(101) }, field: 'name' },
    { name: 'a name that is null', change: { name: null }, field: 'name' },
    { name: 'a malformed email', change: { email: 'not-an-email' }, field: 'email' },
    { name: 'an email of 255 characters', change: { email: emailOfLength(255) }, field: 'email' },
    { name: 'a role that is not a Role', change: { role: 'MANAGER' }, field: 'role' },
    { name: 'a role that is null', change: { role: null }, field: 'role' },
    { name: 'an isActive that is text', change: { isActive: 'false' }, field: 'isActive' },
    { name: 'a `password` key', change: { password: 'Chosen-Passw0rd!' }, field: 'password' },
  ])('answers 400 naming the field for $name, and changes nothing', async ({ change, field }) => {
    const target = await createUser('REQUESTER')
    const before = await listed(target.id)

    // A valid field beside the invalid one is not saved either.
    const res = await patchUser(target.id, { name: `${RUN} edit Not Saved`, ...change })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    expect(await listed(target.id)).toEqual(before)
    expect((await login(target.email, target.password)).status).toBe(200)
  })

  // API-49 (AC-42, BR-06)
  it('answers 409 EMAIL_TAKEN for the email of another user, in any letter case, and changes nothing', async () => {
    const target = await createUser('REQUESTER')
    const other = await createUser('IT_STAFF', { isActive: false })
    const before = await listed(target.id)

    const res = await patchUser(target.id, { name: `${RUN} edit Not Saved`, email: other.email.toUpperCase() })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A user with this email already exists.', code: 'EMAIL_TAKEN', field: 'email' })
    expect(await listed(target.id)).toEqual(before)
  })
})

const UNAUTHENTICATED = { error: 'You are not signed in.', code: 'UNAUTHENTICATED' }

const me = (cookie: string) => request(app).get('/api/auth/me').set('Cookie', cookie)

// BR-14 (AC-17): which changes end the user's sessions.
describe('PATCH /api/admin/users/:id and the sessions of the user it changes', () => {
  it('ends them when the role changes', async () => {
    const target = await signInAs('REQUESTER')

    expect((await patchUser(target.user.id, { role: 'IT_STAFF' })).status).toBe(200)

    const res = await me(target.cookie)
    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(0)
  })

  it('ends them on deactivation, so that reactivation does not bring one back', async () => {
    const target = await signInAs('IT_STAFF')

    expect((await patchUser(target.user.id, { isActive: false })).status).toBe(200)
    expect((await me(target.cookie)).status).toBe(401)

    expect((await patchUser(target.user.id, { isActive: true })).status).toBe(200)
    expect((await me(target.cookie)).status).toBe(401)
  })

  it('keeps them when only the name or email changes, or the role sent is the one they hold', async () => {
    const target = await signInAs('IT_STAFF')

    const res = await patchUser(target.user.id, {
      name: `${RUN} edit Still Signed In`,
      email: `${RUN}.edit.still@example.com`,
      role: 'IT_STAFF',
      isActive: true,
    })

    expect(res.status).toBe(200)
    expect((await me(target.cookie)).body).toMatchObject({ id: target.user.id, name: `${RUN} edit Still Signed In` })
  })
})

// API-52 (AC-45, BR-40)
describe('an Administrator deactivating their own account', () => {
  const SELF_DEACTIVATION = { error: 'You cannot deactivate your own account.', code: 'SELF_DEACTIVATION' }

  it('is answered 409 SELF_DEACTIVATION and stays active and signed in', async () => {
    const self = await signInAs('ADMINISTRATOR')
    const before = await listed(self.user.id)

    const res = await request(app)
      .patch(`/api/admin/users/${self.user.id}`)
      .set('Cookie', self.cookie)
      .send({ name: `${RUN} self Not Saved`, isActive: false })

    expect(res.status).toBe(409)
    expect(res.body).toEqual(SELF_DEACTIVATION)
    expect(await listed(self.user.id)).toEqual(before)
    expect((await me(self.cookie)).status).toBe(200)
  })

  it('may still edit their own name and email, and send isActive true', async () => {
    const self = await signInAs('ADMINISTRATOR')

    const res = await request(app)
      .patch(`/api/admin/users/${self.user.id}`)
      .set('Cookie', self.cookie)
      .send({ name: `${RUN} self Renamed`, isActive: true })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: `${RUN} self Renamed`, isActive: true })
    expect((await me(self.cookie)).status).toBe(200)
  })

  // api-spec.md §1.5: EMAIL_TAKEN is reported before SELF_DEACTIVATION.
  it('is answered 409 EMAIL_TAKEN first when the email is also taken', async () => {
    const self = await signInAs('ADMINISTRATOR')
    const other = await createUser('REQUESTER')

    const res = await request(app)
      .patch(`/api/admin/users/${self.user.id}`)
      .set('Cookie', self.cookie)
      .send({ email: other.email, isActive: false })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_TAKEN')
  })
})

// API-54 (AC-47, BR-25, FR-26)
describe("PATCH /api/admin/users/:id and the Tickets its user owns", () => {
  let requesterCookie: string
  let categoryId: number
  let relatedSystemId: number

  const UNFINISHED = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const
  const FINISHED = ['CLOSED', 'CANCELLED'] as const
  type Status = (typeof UNFINISHED)[number] | (typeof FINISHED)[number]

  // When the test Tickets were given their owner.
  const ASSIGNED_AT = new Date('2026-09-01T08:00:00.000Z')

  beforeAll(async () => {
    requesterCookie = (await signInAs('REQUESTER')).cookie
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id
  })

  // A Ticket in the given status owned by the given user. The staff ticket
  // operations that would put it there belong to other endpoints, so the
  // state is arranged in the database.
  async function ownedTicket(ownerId: number, currentStatus: Status): Promise<number> {
    const created = await request(app).post('/api/tickets').set('Cookie', requesterCookie).send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'MEDIUM',
      summary: 'users-admin.api.test ticket',
      description: 'A ticket created solely to exercise the return to the queue.',
    })
    expect(created.status).toBe(201)

    await prisma.ticket.update({
      where: { id: created.body.id },
      data: { ownerId, currentStatus, ownerChangedAt: ASSIGNED_AT },
    })
    return created.body.id
  }

  async function ownedTickets(ownerId: number) {
    const unfinished: number[] = []
    const finished: number[] = []
    for (const status of UNFINISHED) unfinished.push(await ownedTicket(ownerId, status))
    for (const status of FINISHED) finished.push(await ownedTicket(ownerId, status))

    return { unfinished, finished }
  }

  const ticketsById = (ids: number[]) =>
    prisma.ticket.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
      select: { ownerId: true, currentStatus: true, ownerChangedAt: true },
    })

  it.each([
    { name: 'a deactivated IT Staff owner', role: 'IT_STAFF', change: { isActive: false } },
    { name: 'an IT Staff owner made a Requester', role: 'IT_STAFF', change: { role: 'REQUESTER' } },
    { name: 'an Administrator owner made a Requester', role: 'ADMINISTRATOR', change: { role: 'REQUESTER' } },
  ] as const)(
    'returns the unfinished Tickets of $name to the queue and leaves the finished ones theirs',
    async ({ role, change }) => {
      const owner = await createUser(role)
      const bystander = await createUser('IT_STAFF')
      const tickets = await ownedTickets(owner.id)
      const bystanderTicket = await ownedTicket(bystander.id, 'OPEN')
      expect(await listed(owner.id)).toMatchObject({ ownedUnfinishedTicketCount: 3 })
      const requestedAt = Date.now()

      const res = await patchUser(owner.id, change)

      expect(res.status).toBe(200)
      expect(res.body.unassignedTicketCount).toBe(3)
      expect(res.body.user).toMatchObject({ id: owner.id, ownedUnfinishedTicketCount: 0 })

      // Unassigned, with the status they had and the time of the change.
      const unfinished = await ticketsById(tickets.unfinished)
      expect(unfinished.map((ticket) => ticket.currentStatus)).toEqual([...UNFINISHED])
      for (const ticket of unfinished) {
        expect(ticket.ownerId).toBeNull()
        expect(ticket.ownerChangedAt!.getTime()).toBeGreaterThanOrEqual(requestedAt)
        expect(ticket.ownerChangedAt!.getTime()).toBeLessThanOrEqual(Date.now())
      }

      // The finished ones keep their historical owner.
      expect(await ticketsById(tickets.finished)).toEqual(
        FINISHED.map((currentStatus) => ({ ownerId: owner.id, currentStatus, ownerChangedAt: ASSIGNED_AT })),
      )
      // Nobody else's Ticket is touched.
      expect(await ticketsById([bystanderTicket])).toEqual([
        { ownerId: bystander.id, currentStatus: 'OPEN', ownerChangedAt: ASSIGNED_AT },
      ])
    },
  )

  it.each([
    { name: 'IT Staff made an Administrator', role: 'IT_STAFF', change: { role: 'ADMINISTRATOR' } },
    { name: 'an Administrator made IT Staff', role: 'ADMINISTRATOR', change: { role: 'IT_STAFF' } },
    { name: 'an IT Staff user renamed', role: 'IT_STAFF', change: { name: `${RUN} owner Renamed` } },
  ] as const)('leaves every Ticket with $name', async ({ role, change }) => {
    const owner = await createUser(role)
    const tickets = await ownedTickets(owner.id)

    const res = await patchUser(owner.id, change)

    expect(res.status).toBe(200)
    expect(res.body.unassignedTicketCount).toBe(0)
    expect(res.body.user).toMatchObject({ id: owner.id, ownedUnfinishedTicketCount: 3 })
    for (const ticket of await ticketsById([...tickets.unfinished, ...tickets.finished])) {
      expect(ticket).toMatchObject({ ownerId: owner.id, ownerChangedAt: ASSIGNED_AT })
    }
  })

  it('returns nothing to the queue when a refused change is rolled back', async () => {
    const owner = await createUser('IT_STAFF')
    const other = await createUser('REQUESTER')
    const tickets = await ownedTickets(owner.id)

    const res = await patchUser(owner.id, { isActive: false, email: other.email })

    expect(res.status).toBe(409)
    expect(await listed(owner.id)).toMatchObject({ isActive: true, ownedUnfinishedTicketCount: 3 })
    for (const ticket of await ticketsById(tickets.unfinished)) {
      expect(ticket.ownerId).toBe(owner.id)
    }
  })
})

// api-spec.md §1.5: the role check (step 3) comes before a path id or a
// body is examined, for every /api/admin path.
describe('order of checks under /api/admin', () => {
  const FORBIDDEN = { error: expect.any(String), code: 'FORBIDDEN' }

  it('answers IT Staff and a Requester 403 whatever the id and the body', async () => {
    const target = await createUser('REQUESTER')
    const before = await listed(target.id)

    for (const role of ['IT_STAFF', 'REQUESTER'] as const) {
      const { cookie } = await signInAs(role)
      const as = (method: 'get' | 'post' | 'patch', path: string) => request(app)[method](path).set('Cookie', cookie)

      const answers = [
        await as('get', '/api/admin/users').query({ role: 'MANAGER' }),
        await as('post', '/api/admin/users').send(newUserBody()),
        await as('post', '/api/admin/users').set('Content-Type', 'application/json').send('{"name": '),
        await as('patch', `/api/admin/users/${target.id}`).send({ name: `${RUN} Not Saved` }),
        await as('patch', '/api/admin/users/not-a-number').send({}),
        await as('post', `/api/admin/users/${target.id}/initial-password`),
        await as('post', `/api/admin/users/${NONEXISTENT_ID}/initial-password`),
      ]

      for (const res of answers) {
        expect(res.status).toBe(403)
        expect(res.body).toEqual(FORBIDDEN)
      }
    }
    expect(await listed(target.id)).toEqual(before)
    expect((await login(target.email, target.password)).status).toBe(200)
  })

  it('answers an Administrator 400 for a body that is not JSON', async () => {
    const res = await asAdministrator('post', '/api/admin/users')
      .set('Content-Type', 'application/json')
      .send('{"name": ')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The request body is not valid JSON.', code: 'VALIDATION_ERROR' })
  })
})

// API-51 (AC-44, BR-39, FR-24)
describe('POST /api/admin/users/:id/initial-password', () => {
  const issue = (userId: number | string) => asAdministrator('post', `/api/admin/users/${userId}/initial-password`)

  it('replaces the password of a signed-in user, ends their session, and makes them change it', async () => {
    const target = await signInAs('IT_STAFF')

    const res = await issue(target.user.id)

    expect(res.status).toBe(200)
    expect(res.get('Cache-Control')).toBe('no-store')
    expect(res.body).toEqual({ initialPassword: expect.stringMatching(INITIAL_PASSWORD) })

    // The session they had is over and the previous password is refused.
    const replayed = await me(target.cookie)
    expect(replayed.status).toBe(401)
    expect(replayed.body).toEqual(UNAUTHENTICATED)
    const previous = await login(target.user.email, target.user.password)
    expect(previous.status).toBe(401)
    expect(previous.body.code).toBe('INVALID_CREDENTIALS')

    // The new one signs them in, and must be changed.
    const signedIn = await login(target.user.email, res.body.initialPassword)
    expect(signedIn.status).toBe(200)
    expect(signedIn.body).toMatchObject({ id: target.user.id, role: 'IT_STAFF', mustChangePassword: true })

    // It is shown in that one response only.
    const user = await listed(target.user.id)
    expect(user).toMatchObject({ mustChangePassword: true, hasPassword: true })
    expect(JSON.stringify(user)).not.toContain(res.body.initialPassword)
  })

  it('issues a different password each time, and only the latest works', async () => {
    const target = await createUser('REQUESTER')

    const first = await issue(target.id)
    const second = await issue(target.id)

    expect(second.body.initialPassword).not.toBe(first.body.initialPassword)
    expect((await login(target.email, first.body.initialPassword)).status).toBe(401)
    expect((await login(target.email, second.body.initialPassword)).status).toBe(200)
  })

  it('gives a first password to a user who has none', async () => {
    const target = await createUser('REQUESTER', { hasPassword: false, mustChangePassword: true })
    expect(await listed(target.id)).toMatchObject({ hasPassword: false })

    const res = await issue(target.id)

    expect(res.status).toBe(200)
    expect(await listed(target.id)).toMatchObject({ hasPassword: true, mustChangePassword: true })
    expect((await login(target.email, res.body.initialPassword)).status).toBe(200)
  })

  it('works for an inactive user, who still cannot sign in until activated', async () => {
    const target = await createUser('REQUESTER', { isActive: false })

    const res = await issue(target.id)

    expect(res.status).toBe(200)
    expect(await listed(target.id)).toMatchObject({ isActive: false, mustChangePassword: true })
    const refused = await login(target.email, res.body.initialPassword)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('ACCOUNT_INACTIVE')

    await patchUser(target.id, { isActive: true })
    expect((await login(target.email, res.body.initialPassword)).status).toBe(200)
  })

  it('takes no body: a password sent with the request is not the one set', async () => {
    const target = await createUser('REQUESTER')

    const res = await issue(target.id).send({ initialPassword: 'Chosen-Passw0rd!', password: 'Chosen-Passw0rd!' })

    expect(res.status).toBe(200)
    expect(res.body.initialPassword).not.toBe('Chosen-Passw0rd!')
    expect((await login(target.email, 'Chosen-Passw0rd!')).status).toBe(401)
  })

  it('answers 409 SELF_INITIAL_PASSWORD for the Administrator\'s own account, and changes nothing', async () => {
    const self = await signInAs('ADMINISTRATOR')

    const res = await request(app).post(`/api/admin/users/${self.user.id}/initial-password`).set('Cookie', self.cookie)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: expect.any(String), code: 'SELF_INITIAL_PASSWORD' })
    expect((await me(self.cookie)).body).toMatchObject({ id: self.user.id, mustChangePassword: false })
    expect((await login(self.user.email, self.user.password)).status).toBe(200)
  })

  it.each([NONEXISTENT_ID, 0, 'abc', '99999999999999999999'])('answers 404 for an id no user has (%s)', async (id) => {
    const res = await issue(id)

    expect(res.status).toBe(404)
    expect(res.body).toEqual(USER_NOT_FOUND)
  })
})

// API-53 (AC-46, BR-41). "The only active Administrator" cannot be arranged
// in the shared test database, which other suites fill with Administrators,
// so this runs the application on a database of its own.
describe('the last active Administrator', () => {
  const LAST_ADMINISTRATOR = {
    error: 'This is the last active administrator. Make another user an administrator first.',
    code: 'LAST_ADMINISTRATOR',
  }

  let database: ThrowawayDatabase
  let own: Awaited<ReturnType<typeof applicationOn>>

  beforeAll(async () => {
    database = await createThrowawayDatabase('last_admin')
    await prismaCli(database.url, 'migrate', 'deploy')
    own = await applicationOn(database.url)
  }, 60_000)

  afterAll(async () => {
    await database.drop()
  })

  const users = async () =>
    (await database.client.query('SELECT "id", "role"::text, "isActive" FROM "User" ORDER BY "id"')).rows

  it('cannot give up the role, until another active Administrator exists', async () => {
    const only = await own.signInAs('ADMINISTRATOR')
    const act = (userId: number, body: object) =>
      request(own.app).patch(`/api/admin/users/${userId}`).set('Cookie', only.cookie).send(body)
    // An Administrator who is not active does not count.
    const inactive = await request(own.app)
      .post('/api/admin/users')
      .set('Cookie', only.cookie)
      .send({ name: 'Inactive Administrator', email: 'inactive.administrator@example.com', role: 'ADMINISTRATOR', isActive: false })
    expect(inactive.status).toBe(201)
    const before = await users()

    for (const role of ['IT_STAFF', 'REQUESTER']) {
      const res = await act(only.user.id, { name: 'Not Saved', role })

      expect(res.status).toBe(409)
      expect(res.body).toEqual(LAST_ADMINISTRATOR)
    }
    expect(await users()).toEqual(before)
    expect((await request(own.app).get('/api/auth/me').set('Cookie', only.cookie)).body).toMatchObject({
      name: only.user.name,
      role: 'ADMINISTRATOR',
    })

    // api-spec.md §1.5: SELF_DEACTIVATION is reported before LAST_ADMINISTRATOR.
    const both = await act(only.user.id, { isActive: false, role: 'IT_STAFF' })
    expect(both.status).toBe(409)
    expect(both.body.code).toBe('SELF_DEACTIVATION')

    // Sending the role they already hold is no change, so it is allowed.
    expect((await act(only.user.id, { role: 'ADMINISTRATOR' })).status).toBe(200)

    // With a second active Administrator the same change is allowed, and
    // ends the sessions of the one who made it (BR-14).
    expect((await act(inactive.body.user.id, { isActive: true })).status).toBe(200)
    const allowed = await act(only.user.id, { role: 'IT_STAFF' })

    expect(allowed.status).toBe(200)
    expect(allowed.body.user).toMatchObject({ id: only.user.id, role: 'IT_STAFF', isActive: true })
    expect((await request(own.app).get('/api/auth/me').set('Cookie', only.cookie)).status).toBe(401)
  })

  // tests.md §7 leaves BR-41 under concurrency untested for want of a way to
  // make two requests overlap. Here the test holds the Administrator rows
  // locked until both requests are waiting on them, so they do overlap.
  it('is still there when two Administrators demote each other at the same moment', async () => {
    const first = await own.signInAs('ADMINISTRATOR')
    const second = await own.signInAs('ADMINISTRATOR')
    // Every other Administrator is out of the picture.
    await database.client.query('UPDATE "User" SET "isActive" = false WHERE "id" NOT IN ($1, $2)', [
      first.user.id,
      second.user.id,
    ])
    const demote = (cookie: string, userId: number) =>
      request(own.app).patch(`/api/admin/users/${userId}`).set('Cookie', cookie).send({ role: 'IT_STAFF' })

    await database.client.query('BEGIN')
    await database.client.query(`SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRATOR' FOR UPDATE`)
    // Each demotes the other. Whichever lands second would leave nobody.
    const pending = [demote(first.cookie, second.user.id), demote(second.cookie, first.user.id)].map((req) =>
      req.then((res) => res),
    )
    const observer = new Client({ connectionString: database.url })
    await observer.connect()
    await vi.waitFor(
      async () => {
        const waiting = await observer.query(
          `SELECT count(*)::int AS "count" FROM pg_stat_activity
           WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`,
        )
        expect(waiting.rows[0].count).toBe(2)
      },
      { timeout: 10_000, interval: 50 },
    )
    await observer.end()
    await database.client.query('COMMIT')

    const answers = await Promise.all(pending)

    expect(answers.map((res) => res.status).sort()).toEqual([200, 409])
    expect(answers.find((res) => res.status === 409)!.body).toEqual(LAST_ADMINISTRATOR)
    const administrators = (await users()).filter((user) => user.role === 'ADMINISTRATOR' && user.isActive)
    expect(administrators).toHaveLength(1)
  })
})
