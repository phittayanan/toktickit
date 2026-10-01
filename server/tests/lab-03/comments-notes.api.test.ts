import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { resetClock } from '../../src/clock'
import { installFakeClock } from './support/clock'
import { signInAs } from './support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000 })

let categoryId: number
let relatedSystemId: number

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id
})

afterEach(() => {
  resetClock()
})

async function createTicket(cookie: string): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'comments-notes.api.test ticket',
    description: 'A ticket created solely to exercise Public Comments.',
  })
  expect(res.status).toBe(201)

  return res.body.id
}

const comments = (ticketId: number, cookie: string) =>
  request(app).get(`/api/tickets/${ticketId}/comments`).set('Cookie', cookie)

const postComment = (ticketId: number, cookie: string, body: unknown) =>
  request(app).post(`/api/tickets/${ticketId}/comments`).set('Cookie', cookie).send(body as object)

const updatedAtOf = async (ticketId: number) =>
  (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).updatedAt.toISOString()

// docs/lab-03/api-spec.md §6.1. The Internal Note rows of this file
// (API-41 to API-43, and the note cases of API-44 and API-45) arrive with
// Internal Notes in #52.
describe('Public Comments', () => {
  // API-38 (AC-20, BR-34)
  it('a Requester posts on their own Ticket: the author is the session user and the time is the server\'s, whatever the request says', async () => {
    const requester = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')
    const ticketId = await createTicket(requester.cookie)
    const before = await updatedAtOf(ticketId)
    // The server clock, standing still a few minutes from now so that it
    // is neither the time the request claims nor the time the test runs.
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await postComment(ticketId, requester.cookie, {
      body: 'It still drains within two hours.',
      // None of these is the client's to set.
      authorId: staff.user.id,
      author: { id: staff.user.id, name: 'Somebody Else', role: 'ADMINISTRATOR' },
      createdAt: '2020-01-01T00:00:00.000Z',
      id: 1,
    })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(Number),
      body: 'It still drains within two hours.',
      createdAt: serverTime.toISOString(),
      author: { id: requester.user.id, name: requester.user.name, role: 'REQUESTER' },
    })
    expect(res.body.id).not.toBe(1)

    // The Requester and staff read the same entry.
    for (const cookie of [requester.cookie, staff.cookie]) {
      const listed = await comments(ticketId, cookie)

      expect(listed.status).toBe(200)
      expect(listed.body).toEqual([res.body])
    }

    // A new Public Comment moves the Ticket's last-updated time to now.
    expect(await updatedAtOf(ticketId)).toBe(serverTime.toISOString())
    expect(await updatedAtOf(ticketId)).not.toBe(before)
  })

  // API-39 (AC-20, BR-35)
  it('refuses an empty, a whitespace-only, and a 2001-character body, saves nothing, and accepts 2000 characters', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const ticketId = await createTicket(cookie)
    const before = await updatedAtOf(ticketId)

    const refused = [
      await postComment(ticketId, cookie, {}),
      await postComment(ticketId, cookie, { body: '' }),
      await postComment(ticketId, cookie, { body: '  \n\t ' }),
      await postComment(ticketId, cookie, { body: 'x'.repeat(2001) }),
      await postComment(ticketId, cookie, { body: 42 }),
    ]

    for (const res of refused) {
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'body' })
    }
    // A request with no JSON body at all is a missing `body`.
    const url = `/api/tickets/${ticketId}/comments`
    const withoutJson = [
      await request(app).post(url).set('Cookie', cookie),
      await request(app).post(url).set('Cookie', cookie).set('Content-Type', 'text/plain').send('Not JSON'),
    ]

    for (const res of withoutJson) {
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'A comment is required.', code: 'VALIDATION_ERROR', field: 'body' })
    }
    expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(0)
    expect(await updatedAtOf(ticketId)).toBe(before)

    // The limit is on the trimmed content, which is what is stored.
    const accepted = await postComment(ticketId, cookie, { body: `  ${'x'.repeat(2000)}\n` })

    expect(accepted.status).toBe(201)
    expect(accepted.body.body).toBe('x'.repeat(2000))
  })

  // API-40 (AC-20, BR-36, FR-18)
  it('Staff post on any Ticket, a Requester posts on a Resolved one, and the list is newest first', async () => {
    const requester = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')
    const administrator = await signInAs('ADMINISTRATOR')
    const ticketId = await createTicket(requester.cookie)
    const clock = installFakeClock(new Date(Date.now() + 60_000))
    const post = async (cookie: string, body: string) => {
      clock.advance(1000)
      return postComment(ticketId, cookie, { body })
    }

    const first = await post(staff.cookie, 'We are checking the VPN gateway logs.')
    const second = await post(administrator.cookie, 'Escalated to the network team.')
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'RESOLVED' } })
    const third = await post(requester.cookie, 'The problem has come back.')

    for (const res of [first, second, third]) {
      expect(res.status).toBe(201)
    }
    expect(first.body.author).toEqual({ id: staff.user.id, name: staff.user.name, role: 'IT_STAFF' })
    expect(second.body.author).toEqual({
      id: administrator.user.id,
      name: administrator.user.name,
      role: 'ADMINISTRATOR',
    })

    const listed = await comments(ticketId, requester.cookie)
    expect(listed.status).toBe(200)
    expect(listed.body).toEqual([third.body, second.body, first.body])
  })

  // AC-37 (BR-31), the Public Comment case: api-spec.md §6.1.
  it.each(['CLOSED', 'CANCELLED'] as const)(
    'a %s Ticket takes no Public Comment from its Requester or from Staff, and can still be read',
    async (finished) => {
      const requester = await signInAs('REQUESTER')
      const staff = await signInAs('IT_STAFF')
      const ticketId = await createTicket(requester.cookie)
      const posted = await postComment(ticketId, requester.cookie, { body: 'Posted while the Ticket was open.' })
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: finished } })
      const before = await updatedAtOf(ticketId)

      for (const cookie of [requester.cookie, staff.cookie]) {
        const res = await postComment(ticketId, cookie, { body: 'One more thing.' })

        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: expect.any(String), code: 'TICKET_FINISHED' })
      }

      const listed = await comments(ticketId, requester.cookie)
      expect(listed.status).toBe(200)
      expect(listed.body).toEqual([posted.body])
      expect(await updatedAtOf(ticketId)).toBe(before)
    },
  )

  // api-spec.md §1.5: the lookup (step 4), then the body (step 5), then the
  // finished check (step 6).
  it('answers a request that is wrong in several ways with the first check it fails', async () => {
    const owner = await signInAs('REQUESTER')
    const other = await signInAs('REQUESTER')
    const ticketId = await createTicket(owner.cookie)
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })
    const NOT_FOUND = { error: 'Ticket not found', code: 'NOT_FOUND' }

    // Not the caller's Ticket, with a body that is invalid, or not JSON.
    const foreignInvalid = await postComment(ticketId, other.cookie, { body: '' })
    const foreignUnreadable = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', other.cookie)
      .set('Content-Type', 'application/json')
      .send('{"body": ')
    const malformedId = await request(app).get('/api/tickets/not-a-number/comments').set('Cookie', other.cookie)
    for (const res of [foreignInvalid, foreignUnreadable, malformedId]) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(NOT_FOUND)
    }

    // An id beyond the range of the id column names no Ticket either.
    for (const outOfRange of [2147483648, 99999999999]) {
      const listed = await comments(outOfRange, owner.cookie)
      const posted = await postComment(outOfRange, owner.cookie, { body: 'Is anyone there?' })

      for (const res of [listed, posted]) {
        expect(res.status, `${outOfRange}`).toBe(404)
        expect(res.body, `${outOfRange}`).toEqual(NOT_FOUND)
      }
    }

    // The caller's own finished Ticket, with an invalid body.
    const ownInvalid = await postComment(ticketId, owner.cookie, { body: '' })
    expect(ownInvalid.status).toBe(400)
    expect(ownInvalid.body.field).toBe('body')
  })

  // API-44 (AC-39, BR-35), the Public Comment case.
  it('stores and returns markup verbatim, as a JSON string', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const ticketId = await createTicket(cookie)
    const body = '<script>alert("x")</script>\n<b>bold</b> & <img src=x onerror=alert(1)>'

    const created = await postComment(ticketId, cookie, { body })
    const listed = await comments(ticketId, cookie)

    expect(created.status).toBe(201)
    expect(created.type).toBe('application/json')
    expect(created.body.body).toBe(body)
    expect(listed.type).toBe('application/json')
    expect(listed.body[0].body).toBe(body)
    expect((await prisma.publicComment.findUniqueOrThrow({ where: { id: created.body.id } })).body).toBe(body)
  })

  // API-45 (AC-20, BR-34), the Public Comment case.
  it('has no route to change or delete a comment', async () => {
    const requester = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')
    const ticketId = await createTicket(requester.cookie)
    const created = await postComment(ticketId, requester.cookie, { body: 'The original text.' })
    const paths = [`/api/tickets/${ticketId}/comments/${created.body.id}`, `/api/tickets/${ticketId}/comments`]

    for (const cookie of [requester.cookie, staff.cookie]) {
      for (const path of paths) {
        for (const method of ['put', 'patch', 'delete'] as const) {
          const res = await request(app)[method](path).set('Cookie', cookie).send({ body: 'Changed.' })

          expect(res.status, `${method} ${path}`).toBe(404)
          expect(res.body, `${method} ${path}`).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
        }
      }
    }

    const listed = await comments(ticketId, requester.cookie)
    expect(listed.body).toEqual([created.body])
  })
})
