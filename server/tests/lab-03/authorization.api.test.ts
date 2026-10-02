import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { ENDPOINTS, type Endpoint } from './support/endpoints'
import { ROLES, type Role } from './support/roles'
import { createUser, signIn, signInAs } from './support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 })

const UNAUTHENTICATED = { error: 'You are not signed in.', code: 'UNAUTHENTICATED' }
const PASSWORD_CHANGE_REQUIRED = {
  error: 'You must change your password to continue.',
  code: 'PASSWORD_CHANGE_REQUIRED',
}
// The message is free text; `code` is the contract (api-spec.md §1.4). The
// body has these two keys and nothing else, so it carries no data.
const FORBIDDEN = { error: expect.any(String), code: 'FORBIDDEN' }
const NOT_FOUND = { error: 'Not found', code: 'NOT_FOUND' }

// An id no row has.
const NONEXISTENT_ID = 999999999

let categoryId: number
let relatedSystemId: number

// One signed-in user of each role, shared by the rows that only read.
const cookies = {} as Record<Role, string>

const TICKET_BODY = () => ({
  categoryId,
  relatedSystemId,
  requestedPriority: 'MEDIUM',
  summary: 'authorization.api.test ticket',
  description: 'A ticket created solely to exercise the authorization rules.',
})

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id

  for (const role of ROLES) {
    cookies[role] = (await signInAs(role)).cookie
  }
})

type Method = Endpoint['method']

function send(method: Method, path: string, cookie?: string) {
  const req = request(app)[method.toLowerCase() as Lowercase<Method>](path)

  return cookie ? req.set('Cookie', cookie) : req
}

// Calls an endpoint of the table with no body and an id no row has. The
// session, password-change, and role checks run before a path id, body, or
// resource is examined (api-spec.md §1.5), so their answer needs neither.
function call(endpoint: Endpoint, cookie?: string) {
  return send(endpoint.method, endpoint.path.replace(':id', String(NONEXISTENT_ID)), cookie)
}

// A row of the table as a test: pending, with the enabling issue in its
// name, while the endpoint is one a later issue delivers.
function row(endpoint: Endpoint, who: string, test: () => Promise<void>) {
  const name = `${endpoint.method} ${endpoint.path} ${who}`

  if (endpoint.pendingIssue) {
    it.skip(`${name} (pending #${endpoint.pendingIssue})`, test)
  } else {
    it(name, test)
  }
}

const PROTECTED = ENDPOINTS.filter((endpoint) => endpoint.roles !== 'public')
const PUBLIC = ENDPOINTS.filter((endpoint) => endpoint.roles === 'public')

const permits = (endpoint: Endpoint, role: Role) => (endpoint.roles as readonly Role[]).includes(role)

describe('every endpoint of the contract', () => {
  // API-13 (AC-11, api-spec.md §1.5 step 1)
  describe('with no session', () => {
    for (const endpoint of PROTECTED) {
      row(endpoint, 'answers 401 and no data', async () => {
        const res = await call(endpoint)

        expect(res.status).toBe(401)
        expect(res.body).toEqual(UNAUTHENTICATED)
      })
    }

    // api-spec.md §1.5: health, login, and logout run no session check.
    for (const endpoint of PUBLIC) {
      row(endpoint, 'runs no session check', async () => {
        const res = await call(endpoint)

        expect(res.status).not.toBe(401)
        expect(res.status).not.toBe(403)
      })
    }
  })

  // API-14, API-15 (AC-15, BR-17, specification.md §5.3): a Requester on
  // every /api/staff and /api/admin endpoint, IT Staff on every /api/admin
  // endpoint, and IT Staff and Administrator on each Requester-only one.
  describe('with a role it does not permit', () => {
    for (const endpoint of PROTECTED) {
      for (const role of ROLES.filter((role) => !permits(endpoint, role))) {
        row(endpoint, `answers ${role} 403 and no data`, async () => {
          const res = await call(endpoint, cookies[role])

          expect(res.status).toBe(403)
          expect(res.body).toEqual(FORBIDDEN)
        })
      }
    }
  })

  // specification.md §5.3: the roles marked Yes, Own, or Any pass the
  // session and role checks, whatever the endpoint then answers.
  describe('with a role it permits', () => {
    for (const endpoint of PROTECTED) {
      for (const role of ROLES.filter((role) => permits(endpoint, role))) {
        row(endpoint, `lets ${role} past the session and role checks`, async () => {
          const res = await call(endpoint, cookies[role])

          expect(res.status).not.toBe(401)
          expect(res.status).not.toBe(403)
        })
      }
    }
  })
})

// api-spec.md §1.5 step 2 (BR-02, AC-02): every protected endpoint except
// the current user and change password. The user here is an Administrator,
// whom the role check would let through to all but the Requester-only ones.
describe('every protected endpoint, for a user who must change their password', () => {
  let cookie: string

  beforeAll(async () => {
    const user = await createUser('ADMINISTRATOR', { mustChangePassword: true })
    cookie = await signIn(user.email, user.password)
  })

  for (const endpoint of PROTECTED) {
    if (endpoint.allowedBeforePasswordChange) {
      row(endpoint, 'stays reachable', async () => {
        const res = await call(endpoint, cookie)

        expect(res.status).not.toBe(401)
        expect(res.status).not.toBe(403)
      })
    } else {
      row(endpoint, 'answers 403 PASSWORD_CHANGE_REQUIRED', async () => {
        const res = await call(endpoint, cookie)

        expect(res.status).toBe(403)
        expect(res.body).toEqual(PASSWORD_CHANGE_REQUIRED)
      })
    }
  }
})

// api-spec.md §1.4 and §1.5 step 3: the role is fixed by prefix, so the
// answer under /api/staff and /api/admin is the same for a path the API
// defines and for one it does not.
describe('a path under a role prefix, defined or not', () => {
  const STAFF_PATH = '/api/staff/no-such-resource'
  const ADMIN_PATH = '/api/admin/no-such-resource'
  const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

  it.each(METHODS)('answers a Requester 403 for %s under /api/staff and under /api/admin', async (method) => {
    for (const path of [STAFF_PATH, ADMIN_PATH]) {
      const res = await send(method, path, cookies.REQUESTER)

      expect(res.status, path).toBe(403)
      expect(res.body, path).toEqual(FORBIDDEN)
    }
  })

  it.each(METHODS)('answers IT Staff 403 for %s under /api/admin', async (method) => {
    const res = await send(method, ADMIN_PATH, cookies.IT_STAFF)

    expect(res.status).toBe(403)
    expect(res.body).toEqual(FORBIDDEN)
  })

  it('answers the roles the prefix permits 404 for a path it does not define', async () => {
    const answers = [
      await send('GET', STAFF_PATH, cookies.IT_STAFF),
      await send('GET', STAFF_PATH, cookies.ADMINISTRATOR),
      await send('GET', ADMIN_PATH, cookies.ADMINISTRATOR),
    ]

    for (const res of answers) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(NOT_FOUND)
    }
  })

  it('answers 401 with no session', async () => {
    for (const path of [STAFF_PATH, ADMIN_PATH]) {
      const res = await send('GET', path)

      expect(res.status, path).toBe(401)
      expect(res.body, path).toEqual(UNAUTHENTICATED)
    }
  })

  // The prefix is a path segment: a path that only starts with the same
  // letters is an ordinary unknown path.
  it('does not treat /api/staffing or /api/administration as under a prefix', async () => {
    for (const path of ['/api/staffing', '/api/administration']) {
      const res = await send('GET', path, cookies.REQUESTER)

      expect(res.status, path).toBe(404)
      expect(res.body, path).toEqual(NOT_FOUND)
    }
  })
})

async function createTicket(cookie: string): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', cookie).send(TICKET_BODY())
  expect(res.status).toBe(201)

  return res.body.id
}

async function uploadAttachment(cookie: string, ticketId: number): Promise<number> {
  const res = await request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('Cookie', cookie)
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'screenshot.png', contentType: 'image/png' })
  expect(res.status).toBe(201)

  return res.body.id
}

// api-spec.md §1.5 (BR-19, ADR-0009): a request that is wrong in several
// ways gets the answer of the first check it fails.
describe('order of checks', () => {
  it('answers 401 before the password-change check: a user made inactive who must also change their password', async () => {
    const user = await createUser('REQUESTER', { mustChangePassword: true })
    const cookie = await signIn(user.email, user.password)
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })

    const res = await request(app).get('/api/tickets').set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })

  it('answers the password-change 403 before the role 403', async () => {
    const staff = await createUser('IT_STAFF', { mustChangePassword: true })
    const requester = await createUser('REQUESTER', { mustChangePassword: true })

    const answers = [
      await send('POST', '/api/tickets', await signIn(staff.email, staff.password)),
      await send('GET', '/api/staff/tickets', await signIn(requester.email, requester.password)),
      await send('GET', '/api/admin/users', await signIn(requester.email, requester.password)),
    ]

    for (const res of answers) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual(PASSWORD_CHANGE_REQUIRED)
    }
  })

  it('answers the role 403 before a path id, a body, or a resource is examined', async () => {
    const requester = await signInAs('REQUESTER')
    const ticketId = await createTicket(requester.cookie)
    const attachmentId = await uploadAttachment(requester.cookie, ticketId)
    const asStaff = (method: Method, path: string) => send(method, path, cookies.IT_STAFF)

    const answers = [
      // An existing Ticket, a nonexistent one, and a malformed id.
      await asStaff('GET', `/api/tickets/${ticketId}`),
      await asStaff('GET', `/api/tickets/${NONEXISTENT_ID}`),
      await asStaff('GET', '/api/tickets/not-a-number'),
      // A body and a query that would each be a 400.
      await asStaff('POST', '/api/tickets').send({}),
      await asStaff('GET', '/api/tickets').query({ pageSize: '999' }),
      await asStaff('POST', `/api/tickets/${ticketId}/attachments`),
      await asStaff('POST', `/api/attachments/${attachmentId}/remove`).send({}),
    ]

    for (const res of answers) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual(FORBIDDEN)
    }
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    expect(attachment.removedAt).toBeNull()
  })

  // A body the server cannot read is examined at step 5, so it changes none
  // of the earlier answers.
  it('answers the session, password-change, and role checks before reading a body that is not JSON', async () => {
    const mustChange = await createUser('REQUESTER', { mustChangePassword: true })
    const requester = await signInAs('REQUESTER')
    const post = (path: string, cookie?: string) =>
      send('POST', path, cookie).set('Content-Type', 'application/json').send('{"summary": ')

    for (const path of ['/api/tickets', `/api/attachments/${NONEXISTENT_ID}/remove`]) {
      const signedOut = await post(path)
      expect(signedOut.status, path).toBe(401)
      expect(signedOut.body, path).toEqual(UNAUTHENTICATED)

      const changeRequired = await post(path, await signIn(mustChange.email, mustChange.password))
      expect(changeRequired.status, path).toBe(403)
      expect(changeRequired.body, path).toEqual(PASSWORD_CHANGE_REQUIRED)

      const wrongRole = await post(path, cookies.IT_STAFF)
      expect(wrongRole.status, path).toBe(403)
      expect(wrongRole.body, path).toEqual(FORBIDDEN)

      // Past those checks it is the client's error, as before.
      const permitted = await post(path, requester.cookie)
      expect(permitted.status, path).toBe(400)
      expect(permitted.body, path).toEqual({ error: 'The request body is not valid JSON.', code: 'VALIDATION_ERROR' })
    }
  })

  // api-spec.md §1.5: role and activation are read from the database on
  // each request, not from the session.
  it('applies the role the user holds now, not the one they signed in with', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    expect((await request(app).get('/api/tickets').set('Cookie', cookie)).status).toBe(200)

    await prisma.user.update({ where: { id: user.id }, data: { role: 'IT_STAFF' } })

    const requesterOnly = await request(app).get('/api/tickets').set('Cookie', cookie)
    const staffPrefix = await request(app).get('/api/staff/no-such-resource').set('Cookie', cookie)

    expect(requesterOnly.status).toBe(403)
    expect(requesterOnly.body).toEqual(FORBIDDEN)
    expect(staffPrefix.status).toBe(404)
  })
})

// API-16 (AC-16, BR-17)
describe('Administrator on the staff ticket operations', () => {
  it('succeeds on each exactly as IT Staff does', async () => {
    const requester = await signInAs('REQUESTER')
    const statuses: Partial<Record<Role, number[]>> = {}

    for (const role of ['IT_STAFF', 'ADMINISTRATOR'] as const) {
      const ticketId = await createTicket(requester.cookie)
      const { user, cookie } = await signInAs(role)
      const as = (method: Method, path: string) => send(method, path, cookie)

      const answers = [
        await as('GET', '/api/staff/tickets'),
        await as('GET', `/api/staff/tickets/${ticketId}`),
        // A claim, which also moves a New Ticket to Open (BR-24).
        await as('PUT', `/api/staff/tickets/${ticketId}/owner`).send({ ownerId: user.id, expectedOwnerId: null }),
        await as('PUT', `/api/staff/tickets/${ticketId}/it-priority`).send({ itPriority: 'HIGH' }),
        await as('POST', `/api/staff/tickets/${ticketId}/status`).send({ status: 'IN_PROGRESS', expectedStatus: 'OPEN' }),
        await as('POST', `/api/tickets/${ticketId}/comments`).send({ body: 'We are checking the VPN gateway logs.' }),
        await as('GET', `/api/tickets/${ticketId}/comments`),
        await as('POST', `/api/staff/tickets/${ticketId}/notes`).send({ body: 'Battery health reported 41%.' }),
        await as('GET', `/api/staff/tickets/${ticketId}/notes`),
      ]

      statuses[role] = answers.map((res) => res.status)
    }

    expect(statuses.IT_STAFF).toEqual([200, 200, 200, 200, 200, 201, 200, 201, 200])
    expect(statuses.ADMINISTRATOR).toEqual(statuses.IT_STAFF)
  })
})

// API-17 (AC-17, BR-14)
describe('a signed-in user an Administrator acts on', () => {
  it('gets 401 on their existing session after each of deactivation, a role change, and a new initial password', async () => {
    const administrator = await signInAs('ADMINISTRATOR')
    const actions: Array<(userId: number) => request.Test> = [
      (userId) => send('PATCH', `/api/admin/users/${userId}`, administrator.cookie).send({ isActive: false }),
      (userId) => send('PATCH', `/api/admin/users/${userId}`, administrator.cookie).send({ role: 'IT_STAFF' }),
      (userId) => send('POST', `/api/admin/users/${userId}/initial-password`, administrator.cookie),
    ]

    for (const act of actions) {
      const { user, cookie } = await signInAs('REQUESTER')
      expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)

      expect((await act(user.id)).status).toBe(200)

      const res = await request(app).get('/api/auth/me').set('Cookie', cookie)
      expect(res.status).toBe(401)
      expect(res.body).toEqual(UNAUTHENTICATED)
    }
  })
})

describe('a requester id supplied by the client', () => {
  // API-18 (AC-03, BR-03)
  it('is ignored in the header, the body, and the query: the session user is the Requester', async () => {
    const victim = await signInAs('REQUESTER')
    await createTicket(victim.cookie)

    const { user, cookie } = await signInAs('REQUESTER')

    const created = await request(app)
      .post('/api/tickets')
      .query({ requesterId: victim.user.id })
      .set('Cookie', cookie)
      .set('X-Requester-Id', String(victim.user.id))
      .send({ ...TICKET_BODY(), requesterId: victim.user.id })

    expect(created.status).toBe(201)
    expect(created.body.requesterId).toBe(user.id)

    const listed = await request(app)
      .get('/api/tickets')
      .query({ requesterId: victim.user.id })
      .set('Cookie', cookie)
      .set('X-Requester-Id', String(victim.user.id))
      .send({ requesterId: victim.user.id })

    expect(listed.status).toBe(200)
    expect(listed.body.data.map((ticket: { id: number }) => ticket.id)).toEqual([created.body.id])
  })

  // The header alone no longer identifies anyone (api-spec.md §4.1).
  it('does not stand in for a session', async () => {
    const victim = await signInAs('REQUESTER')

    const res = await request(app).get('/api/tickets').set('X-Requester-Id', String(victim.user.id))

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })
})

// API-19 (AC-19, BR-20, ADR-0004)
describe("another Requester's resource", () => {
  it('answers the same 404 as a nonexistent one, for a Ticket and for an Attachment download', async () => {
    const requesterA = await signInAs('REQUESTER')
    const ticketId = await createTicket(requesterA.cookie)
    const attachmentId = await uploadAttachment(requesterA.cookie, ticketId)
    const requesterB = await signInAs('REQUESTER')
    const asRequesterB = (path: string) => request(app).get(path).set('Cookie', requesterB.cookie)

    const foreignTicket = await asRequesterB(`/api/tickets/${ticketId}`)
    const missingTicket = await asRequesterB(`/api/tickets/${NONEXISTENT_ID}`)
    const foreignDownload = await asRequesterB(`/api/attachments/${attachmentId}/download`)
    const missingDownload = await asRequesterB(`/api/attachments/${NONEXISTENT_ID}/download`)

    expect(foreignTicket.status).toBe(404)
    expect(foreignTicket.body).toEqual({ error: 'Ticket not found' })
    expect(missingTicket.status).toBe(404)
    expect(missingTicket.body).toEqual(foreignTicket.body)

    expect(foreignDownload.status).toBe(404)
    expect(foreignDownload.body).toEqual({ error: 'Attachment not found' })
    expect(missingDownload.status).toBe(404)
    expect(missingDownload.body).toEqual(foreignDownload.body)

    // The owner still reaches both.
    expect((await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', requesterA.cookie)).status).toBe(200)
    expect(
      (await request(app).get(`/api/attachments/${attachmentId}/download`).set('Cookie', requesterA.cookie)).status,
    ).toBe(200)
  })

  // The Public Comment half of API-19 (api-spec.md §6.1).
  it('answers the same 404 for its Public Comments, read or posted, and creates no comment', async () => {
    const requesterA = await signInAs('REQUESTER')
    const ticketId = await createTicket(requesterA.cookie)
    const requesterB = await signInAs('REQUESTER')
    const TICKET_NOT_FOUND = { error: 'Ticket not found', code: 'NOT_FOUND' }

    const answers = [
      await send('GET', `/api/tickets/${ticketId}/comments`, requesterB.cookie),
      await send('GET', `/api/tickets/${NONEXISTENT_ID}/comments`, requesterB.cookie),
      await send('POST', `/api/tickets/${ticketId}/comments`, requesterB.cookie).send({ body: 'Not my Ticket.' }),
      await send('POST', `/api/tickets/${NONEXISTENT_ID}/comments`, requesterB.cookie).send({ body: 'No Ticket.' }),
    ]

    for (const res of answers) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(TICKET_NOT_FOUND)
    }
    expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(0)
  })
})

// API-20 (AC-22, BR-32)
describe('a Requester on the staff operations of their own Ticket', () => {
  it('is answered 403 by the owner, IT Priority, and status endpoints, and the Ticket is unchanged', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    const ticketId = await createTicket(cookie)
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

    const answers = [
      await send('PUT', `/api/staff/tickets/${ticketId}/owner`, cookie).send({ ownerId: user.id, expectedOwnerId: null }),
      await send('PUT', `/api/staff/tickets/${ticketId}/it-priority`, cookie).send({ itPriority: 'HIGH' }),
      await send('POST', `/api/staff/tickets/${ticketId}/status`, cookie).send({
        status: 'CANCELLED',
        expectedStatus: 'NEW',
      }),
    ]

    for (const res of answers) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual(FORBIDDEN)
    }
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).toEqual(before)
  })
})
