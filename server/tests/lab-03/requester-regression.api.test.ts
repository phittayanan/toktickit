import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { createUser, signInAs } from './support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000 })

let categoryId: number
let relatedSystemId: number

const VALID_BODY = () => ({
  categoryId,
  relatedSystemId,
  requestedPriority: 'MEDIUM',
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
})

// The success body of docs/lab-02/api-spec.md `POST /api/tickets`.
const LAB_2_TICKET_FIELDS = [
  'id',
  'ticketNumber',
  'requesterId',
  'categoryId',
  'relatedSystemId',
  'summary',
  'description',
  'requestedPriority',
  'itPriority',
  'currentStatus',
  'createdAt',
  'updatedAt',
]

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id
})

describe('POST /api/tickets', () => {
  // REG-03 (AC-18, BR-26, api-spec.md §4.1)
  it('creates a Ticket for the signed-in Requester, with the Lab 2 fields only and IT Priority equal to Requested Priority', async () => {
    const { user, cookie } = await signInAs('REQUESTER')

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({ ...VALID_BODY(), requestedPriority: 'HIGH' })

    expect(res.status).toBe(201)
    expect(Object.keys(res.body).sort()).toEqual([...LAB_2_TICKET_FIELDS].sort())
    expect(res.body.requesterId).toBe(user.id)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requestedPriority).toBe('HIGH')
    expect(res.body.itPriority).toBe('HIGH')
  })
})

const UNAUTHENTICATED = { error: 'You are not signed in.', code: 'UNAUTHENTICATED' }

// REG-04 (AC-18, api-spec.md §3, specification.md §7.3 and §11 item 23)
describe('reference data', () => {
  it('no longer lists Requesters: GET /api/requesters is answered like any unknown path', async () => {
    const { cookie } = await signInAs('REQUESTER')

    const signedIn = await request(app).get('/api/requesters').set('Cookie', cookie)
    const signedOut = await request(app).get('/api/requesters')

    expect(signedIn.status).toBe(404)
    expect(signedIn.body).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
    expect(signedOut.status).toBe(401)
    expect(signedOut.body).toEqual(UNAUTHENTICATED)
  })

  it.each(['/api/categories', '/api/related-systems'])('%s needs a session', async (path) => {
    const res = await request(app).get(path)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(UNAUTHENTICATED)
  })
})

// api-spec.md §4.1: `currentStatus` accepts all eight statuses, now that a
// Ticket can leave New.
describe('GET /api/tickets', () => {
  const STATUSES = [
    'NEW',
    'OPEN',
    'IN_PROGRESS',
    'WAITING_FOR_REQUESTER',
    'RESOLVED',
    'CLOSED',
    'REOPENED',
    'CANCELLED',
  ] as const

  it('filters by each of the eight Current Status values and still rejects an unknown one', async () => {
    const { user, cookie } = await signInAs('REQUESTER')
    const list = (currentStatus: string) => request(app).get('/api/tickets').query({ currentStatus }).set('Cookie', cookie)

    for (const [index, currentStatus] of STATUSES.entries()) {
      await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-2026-R${user.id}-${index}`,
          requesterId: user.id,
          categoryId,
          relatedSystemId,
          summary: `A Ticket that is ${currentStatus}`,
          description: 'A description long enough to satisfy validation, for a seeded ticket.',
          requestedPriority: 'LOW',
          itPriority: 'LOW',
          currentStatus,
        },
      })
    }

    for (const currentStatus of STATUSES) {
      const res = await list(currentStatus)

      expect(res.status, currentStatus).toBe(200)
      expect(
        res.body.data.map((ticket: { currentStatus: string }) => ticket.currentStatus),
        currentStatus,
      ).toEqual([currentStatus])
    }

    const unknown = await list('DONE')
    expect(unknown.status).toBe(400)
    expect(unknown.body.field).toBe('currentStatus')
  })
})

async function createTicket(cookie: string): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', cookie).send(VALID_BODY())
  expect(res.status).toBe(201)

  return res.body.id
}

function upload(cookie: string, ticketId: number) {
  return request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('Cookie', cookie)
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'screenshot.png', contentType: 'image/png' })
}

// REG-05 to REG-07 test behaviour that #50 delivers (api-spec.md §4.1 to
// §4.3). They are written to the contract and stay pending until then.
describe('Requester Ticket Detail additions', () => {
  // REG-05 (AC-23)
  it('GET /api/tickets/:id adds the owner name and the resolution fields to the Lab 2 fields', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const owner = await createUser('IT_STAFF')
    const ticketId = await createTicket(cookie)
    const resolvedAt = new Date('2026-10-03T08:00:00.000Z')
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ownerId: owner.id,
        ownerChangedAt: resolvedAt,
        currentStatus: 'RESOLVED',
        resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
        resolvedAt,
      },
    })

    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    for (const field of [...LAB_2_TICKET_FIELDS, 'attachments']) {
      expect(res.body).toHaveProperty(field)
    }
    expect(res.body).toMatchObject({
      id: ticketId,
      currentStatus: 'RESOLVED',
      ownerName: owner.name,
      resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
      resolvedAt: resolvedAt.toISOString(),
      requesterResolvedAt: null,
    })
    // Those four and nothing else: the owner is a name, not a user id.
    expect(Object.keys(res.body).sort()).toEqual(
      [
        ...LAB_2_TICKET_FIELDS,
        'attachments',
        'ownerName',
        'resolutionSummary',
        'resolvedAt',
        'requesterResolvedAt',
      ].sort(),
    )

    await prisma.ticket.update({ where: { id: ticketId }, data: { ownerId: null } })
    const unassigned = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie)
    expect(unassigned.body.ownerName).toBeNull()
  })

  // REG-06 (AC-21, BR-33)
  it('Problem Appears Resolved is set, kept, and withdrawn without changing the status, and refused on a Resolved, a finished, and another Requester\'s Ticket', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const indication = (method: 'put' | 'delete', ticketId: number, as = cookie) =>
      request(app)[method](`/api/tickets/${ticketId}/resolution-indication`).set('Cookie', as)
    const statusOf = async (ticketId: number) =>
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus

    const ticketId = await createTicket(cookie)

    const set = await indication('put', ticketId)
    expect(set.status).toBe(200)
    expect(set.body).toEqual({ requesterResolvedAt: expect.any(String) })

    const setAgain = await indication('put', ticketId)
    expect(setAgain.status).toBe(200)
    expect(setAgain.body).toEqual(set.body)

    const withdrawn = await indication('delete', ticketId)
    expect(withdrawn.status).toBe(200)
    expect(withdrawn.body).toEqual({ requesterResolvedAt: null })

    const withdrawnAgain = await indication('delete', ticketId)
    expect(withdrawnAgain.status).toBe(200)
    expect(withdrawnAgain.body).toEqual({ requesterResolvedAt: null })
    expect(await statusOf(ticketId)).toBe('NEW')

    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'RESOLVED' } })
    const onResolved = await indication('put', ticketId)
    expect(onResolved.status).toBe(409)
    expect(onResolved.body.code).toBe('INDICATION_NOT_AVAILABLE')
    // api-spec.md §4.3: withdrawing is refused only on a finished Ticket.
    const withdrawnOnResolved = await indication('delete', ticketId)
    expect(withdrawnOnResolved.status).toBe(200)
    expect(withdrawnOnResolved.body).toEqual({ requesterResolvedAt: null })

    for (const finished of ['CLOSED', 'CANCELLED'] as const) {
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: finished } })

      for (const method of ['put', 'delete'] as const) {
        const res = await indication(method, ticketId)
        expect(res.status, `${method} ${finished}`).toBe(409)
        expect(res.body.code, `${method} ${finished}`).toBe('TICKET_FINISHED')
      }
      expect(await statusOf(ticketId)).toBe(finished)
    }

    // Another Requester's Ticket answers as a nonexistent one does (BR-20).
    const other = await signInAs('REQUESTER')
    const foreignTicketId = await createTicket(cookie)
    for (const method of ['put', 'delete'] as const) {
      const foreign = await indication(method, foreignTicketId, other.cookie)
      const missing = await indication(method, 999999999, other.cookie)

      expect(foreign.status).toBe(404)
      expect(missing.status).toBe(404)
      expect(foreign.body).toEqual(missing.body)
      // api-spec.md §4: the unchanged Lab 2 body.
      expect(foreign.body).toEqual({ error: 'Ticket not found' })
    }
    const untouched = await prisma.ticket.findUniqueOrThrow({ where: { id: foreignTicketId } })
    expect(untouched.requesterResolvedAt).toBeNull()
  })

  // REG-07 (AC-37, BR-31)
  it.each(['CLOSED', 'CANCELLED'] as const)(
    'a %s Ticket refuses a new Attachment and a soft removal, and still serves a download',
    async (finished) => {
      const { cookie } = await signInAs('REQUESTER')
      const ticketId = await createTicket(cookie)
      const uploaded = await upload(cookie, ticketId)
      expect(uploaded.status).toBe(201)
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: finished } })

      const added = await upload(cookie, ticketId)
      const removed = await request(app)
        .post(`/api/attachments/${uploaded.body.id}/remove`)
        .set('Cookie', cookie)
        .send({ removalReason: 'Uploaded the wrong screenshot' })
      const downloaded = await request(app).get(`/api/attachments/${uploaded.body.id}/download`).set('Cookie', cookie)

      expect(added.status).toBe(409)
      expect(added.body.code).toBe('TICKET_FINISHED')
      expect(removed.status).toBe(409)
      expect(removed.body.code).toBe('TICKET_FINISHED')
      expect(downloaded.status).toBe(200)

      // api-spec.md §1.5: on these two endpoints the finished check comes
      // directly after the lookup, ahead of the validation of the input.
      const invalidFile = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set('Cookie', cookie)
        .attach('file', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' })
      const noFile = await request(app).post(`/api/tickets/${ticketId}/attachments`).set('Cookie', cookie)
      const noReason = await request(app)
        .post(`/api/attachments/${uploaded.body.id}/remove`)
        .set('Cookie', cookie)
        .send({})
      for (const res of [invalidFile, noFile, noReason]) {
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: expect.any(String), code: 'TICKET_FINISHED' })
      }

      expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(1)
    },
  )

  // REG-07 (BR-31): the status a soft removal goes by is read under the
  // Ticket's row lock, so a Ticket being finished at that moment keeps its
  // Attachment.
  it('a soft removal waits for a Ticket that is being finished, and is then refused', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const ticketId = await createTicket(cookie)
    const uploaded = await upload(cookie, ticketId)
    expect(uploaded.status).toBe(201)

    let removal!: Promise<request.Response>
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`
      await tx.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })

      removal = request(app)
        .post(`/api/attachments/${uploaded.body.id}/remove`)
        .set('Cookie', cookie)
        .send({ removalReason: 'Uploaded the wrong screenshot' })
        .then((res) => res)
      // Long enough for a removal that does not wait to have answered.
      await new Promise((resolve) => setTimeout(resolve, 1000))
    })

    const removed = await removal
    expect(removed.status).toBe(409)
    expect(removed.body).toEqual({ error: expect.any(String), code: 'TICKET_FINISHED' })
    expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(1)
  })
})
