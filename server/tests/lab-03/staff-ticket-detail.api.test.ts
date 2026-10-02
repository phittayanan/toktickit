import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { now, resetClock } from '../../src/clock'
import { installFakeClock } from './support/clock'
import { createUser, signInAs } from './support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000 })

let category: { id: number; name: string }
let relatedSystem: { id: number; name: string }

beforeAll(async () => {
  const select = { id: true, name: true }
  category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, select })
  relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, select })
})

afterEach(() => {
  resetClock()
})

const SUMMARY = 'staff-ticket-detail.api.test ticket'
const DESCRIPTION = 'A ticket created solely to exercise the staff ticket operations.'

async function createTicket(cookie: string): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', cookie).send({
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    requestedPriority: 'MEDIUM',
    summary: SUMMARY,
    description: DESCRIPTION,
  })
  expect(res.status).toBe(201)

  return res.body.id
}

const detail = (ticketId: number | string, cookie: string) =>
  request(app).get(`/api/staff/tickets/${ticketId}`).set('Cookie', cookie)

const TICKET_NOT_FOUND = { error: 'Ticket not found', code: 'NOT_FOUND' }

// docs/lab-03/api-spec.md §5.2 and §6.2
describe('GET /api/staff/tickets/:id', () => {
  // API-27 (AC-30, FR-14, FR-20)
  it('returns the StaffTicket of any Requester\'s Ticket, with its active and removed Attachments, and Staff can download the active one', async () => {
    const requester = await signInAs('REQUESTER')
    const staff = await signInAs('IT_STAFF')
    const ticketId = await createTicket(requester.cookie)
    const upload = (filename: string, content: Buffer) =>
      request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set('Cookie', requester.cookie)
        .attach('file', content, { filename, contentType: 'image/png' })
    const PNG = [0x89, 0x50, 0x4e, 0x47]
    const rightContent = Buffer.from([...PNG, 0x02])
    const removed = await upload('wrong-screenshot.png', Buffer.from([...PNG, 0x01]))
    const active = await upload('vpn-error.png', rightContent)
    const removal = await request(app)
      .post(`/api/attachments/${removed.body.id}/remove`)
      .set('Cookie', requester.cookie)
      .send({ removalReason: 'Uploaded the wrong screenshot' })
    expect([removed.status, active.status, removal.status]).toEqual([201, 201, 200])
    const posted = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Cookie', requester.cookie)
      .send({ body: 'The VPN drops every few minutes.' })
    expect(posted.status).toBe(201)
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

    const res = await detail(ticketId, staff.cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: ticketId,
      ticketNumber: stored.ticketNumber,
      summary: SUMMARY,
      description: DESCRIPTION,
      requester: { id: requester.user.id, name: requester.user.name, email: requester.user.email, isActive: true },
      category,
      relatedSystem,
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'NEW',
      allowedTransitions: ['OPEN', 'CANCELLED'],
      owner: null,
      ownerChangedAt: null,
      resolutionSummary: null,
      resolvedAt: null,
      requesterResolvedAt: null,
      publicCommentCount: 1,
      internalNoteCount: 0,
      attachments: [
        {
          id: active.body.id,
          originalFilename: 'vpn-error.png',
          mimeType: 'image/png',
          sizeBytes: 5,
          createdAt: active.body.createdAt,
          removedAt: null,
          removedByRequesterId: null,
          removalReason: null,
        },
        {
          id: removed.body.id,
          originalFilename: 'wrong-screenshot.png',
          mimeType: 'image/png',
          sizeBytes: 5,
          createdAt: removed.body.createdAt,
          removedAt: removal.body.removedAt,
          removedByRequesterId: requester.user.id,
          removalReason: 'Uploaded the wrong screenshot',
        },
      ],
      createdAt: stored.createdAt.toISOString(),
      updatedAt: stored.updatedAt.toISOString(),
    })

    const download = (attachmentId: number) =>
      request(app).get(`/api/attachments/${attachmentId}/download`).set('Cookie', staff.cookie)
    const downloaded = await download(active.body.id)
    expect(downloaded.status).toBe(200)
    expect(Buffer.compare(downloaded.body, rightContent)).toBe(0)
    expect(downloaded.get('Content-Disposition')).toContain('vpn-error.png')
    // §6.2: a soft-removed Attachment is 404 for everyone.
    const refused = await download(removed.body.id)
    expect(refused.status).toBe(404)
    expect(refused.body).toEqual({ error: 'Attachment not found' })
  })

  // API-27, the unknown id: api-spec.md §5.
  it('answers 404 for an id no Ticket has, and for one that is not an id', async () => {
    const { cookie } = await signInAs('ADMINISTRATOR')

    for (const id of [999999999, 2147483648, 'not-a-number', 0]) {
      const res = await detail(id, cookie)

      expect(res.status, `${id}`).toBe(404)
      expect(res.body, `${id}`).toEqual(TICKET_NOT_FOUND)
    }

    // §6.2: and so does an Attachment id that names none.
    for (const id of [999999999, 2147483648, 'not-a-number']) {
      const res = await request(app).get(`/api/attachments/${id}/download`).set('Cookie', cookie)

      expect(res.status, `${id}`).toBe(404)
      expect(res.body, `${id}`).toEqual({ error: 'Attachment not found' })
    }
  })
})

type Staff = Awaited<ReturnType<typeof signInAs>>

const putOwner = (ticketId: number, cookie: string, body: unknown) =>
  request(app).put(`/api/staff/tickets/${ticketId}/owner`).set('Cookie', cookie).send(body as object)

const storedTicket = (ticketId: number) => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

// A New, unassigned Ticket of a Requester of its own.
async function newTicket(): Promise<number> {
  return createTicket((await signInAs('REQUESTER')).cookie)
}

// docs/lab-03/api-spec.md §5.4
describe('PUT /api/staff/tickets/:id/owner', () => {
  // API-28 (AC-31, BR-22, BR-24)
  it('a claim of an unassigned New Ticket makes the session user its owner, records the time, and opens it', async () => {
    const staff: Staff = await signInAs('IT_STAFF')
    const ticketId = await newTicket()
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await putOwner(ticketId, staff.cookie, { ownerId: staff.user.id, expectedOwnerId: null })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticketId,
      owner: { id: staff.user.id, name: staff.user.name },
      ownerChangedAt: serverTime.toISOString(),
      currentStatus: 'OPEN',
      allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
      updatedAt: serverTime.toISOString(),
    })
    expect(res.body).toEqual((await detail(ticketId, staff.cookie)).body)
  })

  // API-29 (AC-32, BR-22, BR-24)
  it('assigns, unassigns, and reassigns, moving ownerChangedAt each time the owner changes and never otherwise', async () => {
    const staff = await signInAs('IT_STAFF')
    const colleague = await signInAs('ADMINISTRATOR')
    const ticketId = await newTicket()
    const clock = installFakeClock(new Date(Date.now() + 5 * 60_000))
    const tick = () => {
      clock.advance(60_000)
      return now().toISOString()
    }

    // Assigned to another active Staff user: a New Ticket opens (BR-24).
    const assignedAt = tick()
    const assigned = await putOwner(ticketId, staff.cookie, { ownerId: colleague.user.id, expectedOwnerId: null })
    expect(assigned.status).toBe(200)
    expect(assigned.body).toMatchObject({
      owner: { id: colleague.user.id, name: colleague.user.name },
      ownerChangedAt: assignedAt,
      currentStatus: 'OPEN',
      updatedAt: assignedAt,
    })

    // The owner it already has: 200, and nothing moves.
    tick()
    const again = await putOwner(ticketId, staff.cookie, {
      ownerId: colleague.user.id,
      expectedOwnerId: colleague.user.id,
    })
    expect(again.status).toBe(200)
    expect(again.body).toEqual(assigned.body)

    // Returned to unassigned: the time moves, the status stays.
    const unassignedAt = tick()
    const unassigned = await putOwner(ticketId, staff.cookie, { ownerId: null, expectedOwnerId: colleague.user.id })
    expect(unassigned.status).toBe(200)
    expect(unassigned.body).toMatchObject({
      owner: null,
      ownerChangedAt: unassignedAt,
      currentStatus: 'OPEN',
      updatedAt: unassignedAt,
    })

    // Unassigned again: also the owner it already has.
    tick()
    const stillUnassigned = await putOwner(ticketId, staff.cookie, { ownerId: null, expectedOwnerId: null })
    expect(stillUnassigned.status).toBe(200)
    expect(stillUnassigned.body).toEqual(unassigned.body)

    // Assigned on an In Progress Ticket: only a New Ticket changes status.
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'IN_PROGRESS' } })
    const reassignedAt = tick()
    const reassigned = await putOwner(ticketId, colleague.cookie, { ownerId: staff.user.id, expectedOwnerId: null })
    expect(reassigned.status).toBe(200)
    expect(reassigned.body).toMatchObject({
      owner: { id: staff.user.id, name: staff.user.name },
      ownerChangedAt: reassignedAt,
      currentStatus: 'IN_PROGRESS',
    })
  })

  // API-30 (AC-32, BR-21)
  it('refuses an inactive Staff user, a Requester, and an unknown id as owner, with one message, and changes nothing', async () => {
    const staff = await signInAs('IT_STAFF')
    const inactive = await createUser('IT_STAFF', { isActive: false })
    const requester = await createUser('REQUESTER')
    const ticketId = await newTicket()
    const before = await storedTicket(ticketId)

    for (const ownerId of [inactive.id, requester.id, 999999999, 2147483648, 0, -1]) {
      const res = await putOwner(ticketId, staff.cookie, { ownerId, expectedOwnerId: null })

      expect(res.status, `${ownerId}`).toBe(400)
      expect(res.body, `${ownerId}`).toEqual({
        error: 'Owner must be an active IT Staff or Administrator user.',
        code: 'VALIDATION_ERROR',
        field: 'ownerId',
      })
    }
    expect(await storedTicket(ticketId)).toEqual(before)
  })

  // api-spec.md §5.4: both keys are required, each a user id or null.
  it.each([
    [{}, 'ownerId'],
    [{ expectedOwnerId: null }, 'ownerId'],
    [{ ownerId: '12', expectedOwnerId: null }, 'ownerId'],
    [{ ownerId: 1.5, expectedOwnerId: null }, 'ownerId'],
    [{ ownerId: null }, 'expectedOwnerId'],
    [{ ownerId: null, expectedOwnerId: 'none' }, 'expectedOwnerId'],
    [{ ownerId: null, expectedOwnerId: true }, 'expectedOwnerId'],
  ])('answers 400 to %j, naming %s', async (body, field) => {
    const staff = await signInAs('IT_STAFF')
    const ticketId = await newTicket()

    const res = await putOwner(ticketId, staff.cookie, body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    expect((await storedTicket(ticketId)).ownerId).toBeNull()
  })

  // API-31 (AC-32, BR-23)
  it('refuses a request whose expectedOwnerId is stale, and the owner stays', async () => {
    const staff = await signInAs('IT_STAFF')
    const colleague = await signInAs('IT_STAFF')
    const ticketId = await newTicket()
    // The colleague claims it after `staff` loaded the Ticket as unassigned.
    await putOwner(ticketId, colleague.cookie, { ownerId: colleague.user.id, expectedOwnerId: null })
    const before = await storedTicket(ticketId)

    const stale = [
      { ownerId: staff.user.id, expectedOwnerId: null },
      { ownerId: null, expectedOwnerId: staff.user.id },
      // Also when it asks for the owner the Ticket already has.
      { ownerId: colleague.user.id, expectedOwnerId: null },
    ]
    for (const body of stale) {
      const res = await putOwner(ticketId, staff.cookie, body)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), code: 'OWNER_CHANGED' })
    }
    expect(await storedTicket(ticketId)).toEqual(before)
  })

  // api-spec.md §1.5: the lookup (step 4), then the body (step 5).
  it('answers 404 for an unknown Ticket whatever the body', async () => {
    const staff = await signInAs('IT_STAFF')

    const invalid = await putOwner(999999999, staff.cookie, { ownerId: 'x' })
    const unreadable = await request(app)
      .put('/api/staff/tickets/999999999/owner')
      .set('Cookie', staff.cookie)
      .set('Content-Type', 'application/json')
      .send('{"ownerId": ')

    for (const res of [invalid, unreadable]) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(TICKET_NOT_FOUND)
    }
  })
})

const putItPriority = (ticketId: number, cookie: string, body: unknown) =>
  request(app).put(`/api/staff/tickets/${ticketId}/it-priority`).set('Cookie', cookie).send(body as object)

// docs/lab-03/api-spec.md §5.5
describe('PUT /api/staff/tickets/:id/it-priority', () => {
  // API-32 (AC-33, BR-26)
  it('stores a valid IT Priority and never touches the Requested Priority', async () => {
    const staff = await signInAs('IT_STAFF')
    const ticketId = await newTicket()
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await putItPriority(ticketId, staff.cookie, { itPriority: 'HIGH' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticketId,
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'NEW',
      updatedAt: serverTime.toISOString(),
    })
    expect(res.body).toEqual((await detail(ticketId, staff.cookie)).body)
    expect(await storedTicket(ticketId)).toMatchObject({ requestedPriority: 'MEDIUM', itPriority: 'HIGH' })
  })

  // API-32, the invalid value
  it.each([{}, { itPriority: 'URGENT' }, { itPriority: 'high' }, { itPriority: null }, { itPriority: 3 }])(
    'answers 400 to %j, naming itPriority, and stores nothing',
    async (body) => {
      const staff = await signInAs('IT_STAFF')
      const ticketId = await newTicket()
      const before = await storedTicket(ticketId)

      const res = await putItPriority(ticketId, staff.cookie, body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'itPriority' })
      expect(await storedTicket(ticketId)).toEqual(before)
    },
  )

  it('answers 404 for an unknown Ticket whatever the body', async () => {
    const staff = await signInAs('IT_STAFF')

    const res = await putItPriority(999999999, staff.cookie, { itPriority: 'URGENT' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual(TICKET_NOT_FOUND)
  })
})

type Status =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

const STATUSES: Status[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]
const UNFINISHED: Status[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'REOPENED']

// The matrix of specification.md BR-28, row by row.
const PERMITTED: Array<[from: Status, to: Status]> = [
  ['NEW', 'OPEN'],
  ['NEW', 'CANCELLED'],
  ['OPEN', 'IN_PROGRESS'],
  ['OPEN', 'WAITING_FOR_REQUESTER'],
  ['OPEN', 'CANCELLED'],
  ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'],
  ['IN_PROGRESS', 'RESOLVED'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['WAITING_FOR_REQUESTER', 'IN_PROGRESS'],
  ['WAITING_FOR_REQUESTER', 'RESOLVED'],
  ['WAITING_FOR_REQUESTER', 'CANCELLED'],
  ['RESOLVED', 'CLOSED'],
  ['RESOLVED', 'REOPENED'],
  ['REOPENED', 'IN_PROGRESS'],
  ['REOPENED', 'WAITING_FOR_REQUESTER'],
  ['REOPENED', 'RESOLVED'],
  ['REOPENED', 'CANCELLED'],
]
const isPermitted = (from: Status, to: Status) => PERMITTED.some(([f, t]) => f === from && t === to)

const SUMMARY_OF_RESOLUTION = 'Replaced the battery; charge now holds for 7 hours.'

const postStatus = (ticketId: number, cookie: string, body: unknown) =>
  request(app).post(`/api/staff/tickets/${ticketId}/status`).set('Cookie', cookie).send(body as object)

// A status request for `to` as a client that last saw `from` sends it.
const transition = (from: Status, to: Status) => ({
  status: to,
  expectedStatus: from,
  ...(to === 'RESOLVED' && { resolutionSummary: SUMMARY_OF_RESOLUTION }),
})

// docs/lab-03/api-spec.md §5.6
describe('POST /api/staff/tickets/:id/status', () => {
  let staff: Staff
  let requester: Staff

  beforeAll(async () => {
    staff = await signInAs('IT_STAFF')
    requester = await signInAs('REQUESTER')
  })

  // A Ticket put in `status`, owned by `staff` unless told otherwise.
  async function ticketIn(status: Status, data: { ownerId?: number | null; requesterResolvedAt?: Date } = {}) {
    const ticketId = await createTicket(requester.cookie)
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { currentStatus: status, ownerId: staff.user.id, ...data },
    })

    return ticketId
  }

  // API-33 (AC-34, BR-28)
  it.each(PERMITTED)('moves a Ticket from %s to %s', async (from, to) => {
    const ticketId = await ticketIn(from)
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await postStatus(ticketId, staff.cookie, transition(from, to))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticketId,
      currentStatus: to,
      allowedTransitions: PERMITTED.filter(([f]) => f === to).map(([, t]) => t),
      updatedAt: serverTime.toISOString(),
    })
    expect(res.body).toEqual((await detail(ticketId, staff.cookie)).body)
    expect((await storedTicket(ticketId)).currentStatus).toBe(to)
  })

  // API-34 (AC-34, BR-28)
  it.each(UNFINISHED)('refuses every move from %s that the matrix does not permit, including to the status it already has', async (from) => {
    const ticketId = await ticketIn(from)
    const before = await storedTicket(ticketId)

    for (const to of STATUSES.filter((status) => !isPermitted(from, status))) {
      const res = await postStatus(ticketId, staff.cookie, transition(from, to))

      expect(res.status, `${from} to ${to}`).toBe(409)
      expect(res.body, `${from} to ${to}`).toEqual({ error: expect.any(String), code: 'INVALID_TRANSITION' })
    }
    expect(await storedTicket(ticketId)).toEqual(before)
  })

  // API-35 (AC-35, BR-29, BR-33)
  it('resolves only a Ticket that has an owner, with a Resolution Summary of 10 to 2000 characters, and clears the Requester\'s flag', async () => {
    const flaggedAt = new Date('2026-10-01T04:00:00.000Z')
    const ticketId = await ticketIn('IN_PROGRESS', { ownerId: null, requesterResolvedAt: flaggedAt })
    const before = await storedTicket(ticketId)
    const resolve = (resolutionSummary?: unknown) =>
      postStatus(ticketId, staff.cookie, {
        status: 'RESOLVED',
        expectedStatus: 'IN_PROGRESS',
        ...(resolutionSummary !== undefined && { resolutionSummary }),
      })

    // No owner.
    const unowned = await resolve(SUMMARY_OF_RESOLUTION)
    expect(unowned.status).toBe(409)
    expect(unowned.body).toEqual({ error: expect.any(String), code: 'OWNER_REQUIRED' })

    // No valid summary, with or without an owner: 9 characters once
    // trimmed, 2001, missing, empty, and not text.
    for (const ownerId of [null, staff.user.id]) {
      await prisma.ticket.update({ where: { id: ticketId }, data: { ownerId, updatedAt: before.updatedAt } })
      for (const summary of [undefined, '', '123456789', '   123456789   ', 'x'.repeat(2001), 42, null]) {
        const res = await resolve(summary)

        expect(res.status, `${summary}`).toBe(400)
        expect(res.body, `${summary}`).toEqual({
          error: expect.any(String),
          code: 'VALIDATION_ERROR',
          field: 'resolutionSummary',
        })
      }
    }
    expect(await storedTicket(ticketId)).toEqual({ ...before, ownerId: staff.user.id })

    // An owner and a valid summary.
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)
    const resolved = await resolve('  1234567890  ')

    expect(resolved.status).toBe(200)
    expect(resolved.body).toMatchObject({
      currentStatus: 'RESOLVED',
      resolutionSummary: '1234567890',
      resolvedAt: serverTime.toISOString(),
      requesterResolvedAt: null,
    })
    // The Requester reads the summary in their own detail.
    const own = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', requester.cookie)
    expect(own.body).toMatchObject({
      currentStatus: 'RESOLVED',
      resolutionSummary: '1234567890',
      resolvedAt: serverTime.toISOString(),
      requesterResolvedAt: null,
    })
  })

  // api-spec.md §5.6: 2000 characters is accepted; other transitions leave
  // the resolution fields as they are, and a later resolution replaces them.
  it('keeps the latest resolution through a reopening, until the Ticket is resolved again', async () => {
    const ticketId = await ticketIn('IN_PROGRESS')
    const clock = installFakeClock(new Date(Date.now() + 5 * 60_000))
    const firstSummary = 'x'.repeat(2000)
    const firstTime = now().toISOString()

    const first = await postStatus(ticketId, staff.cookie, {
      status: 'RESOLVED',
      expectedStatus: 'IN_PROGRESS',
      resolutionSummary: firstSummary,
    })
    clock.advance(60_000)
    const reopened = await postStatus(ticketId, staff.cookie, { status: 'REOPENED', expectedStatus: 'RESOLVED' })
    clock.advance(60_000)
    const second = await postStatus(ticketId, staff.cookie, transition('REOPENED', 'RESOLVED'))

    expect([first.status, reopened.status, second.status]).toEqual([200, 200, 200])
    expect(first.body).toMatchObject({ resolutionSummary: firstSummary, resolvedAt: firstTime })
    expect(reopened.body).toMatchObject({
      currentStatus: 'REOPENED',
      resolutionSummary: firstSummary,
      resolvedAt: firstTime,
    })
    expect(second.body).toMatchObject({ resolutionSummary: SUMMARY_OF_RESOLUTION, resolvedAt: now().toISOString() })
  })

  // api-spec.md §5.6, the `400`s.
  it.each([
    [{}, 'status'],
    [{ expectedStatus: 'NEW' }, 'status'],
    [{ status: 'DONE', expectedStatus: 'NEW' }, 'status'],
    [{ status: 'open', expectedStatus: 'NEW' }, 'status'],
    [{ status: 'OPEN' }, 'expectedStatus'],
    [{ status: 'OPEN', expectedStatus: 'DONE' }, 'expectedStatus'],
    [{ status: 'OPEN', expectedStatus: null }, 'expectedStatus'],
    // A Resolution Summary belongs to RESOLVED only.
    [{ status: 'OPEN', expectedStatus: 'NEW', resolutionSummary: SUMMARY_OF_RESOLUTION }, 'resolutionSummary'],
    [{ status: 'OPEN', expectedStatus: 'NEW', resolutionSummary: '' }, 'resolutionSummary'],
    [{ status: 'OPEN', expectedStatus: 'NEW', resolutionSummary: null }, 'resolutionSummary'],
  ])('answers 400 to %j, naming %s, and the status stays', async (body, field) => {
    const ticketId = await ticketIn('NEW')

    const res = await postStatus(ticketId, staff.cookie, body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field })
    expect((await storedTicket(ticketId)).currentStatus).toBe('NEW')
  })

  // API-36 (AC-36, BR-30)
  it('refuses a request whose expectedStatus is stale, ahead of the transition rule, and the status stays', async () => {
    const ticketId = await ticketIn('IN_PROGRESS', { ownerId: null })
    const before = await storedTicket(ticketId)

    const stale = [
      // The client last saw it Open; someone has since started work on it.
      { status: 'WAITING_FOR_REQUESTER', expectedStatus: 'OPEN' },
      // Also when the move asked for is no longer one the matrix permits,
      { status: 'IN_PROGRESS', expectedStatus: 'OPEN' },
      // or would need an owner.
      { status: 'RESOLVED', expectedStatus: 'WAITING_FOR_REQUESTER', resolutionSummary: SUMMARY_OF_RESOLUTION },
    ]
    for (const body of stale) {
      const res = await postStatus(ticketId, staff.cookie, body)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), code: 'STATUS_CHANGED' })
    }
    expect(await storedTicket(ticketId)).toEqual(before)
  })

  // api-spec.md §1.5 step 8: INVALID_TRANSITION, then OWNER_REQUIRED.
  it('answers INVALID_TRANSITION, not OWNER_REQUIRED, for a resolution the matrix does not permit', async () => {
    const ticketId = await ticketIn('NEW', { ownerId: null })

    const res = await postStatus(ticketId, staff.cookie, transition('NEW', 'RESOLVED'))

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  it('answers 404 for an unknown Ticket whatever the body', async () => {
    const res = await postStatus(999999999, staff.cookie, { status: 'DONE' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual(TICKET_NOT_FOUND)
  })
})

// docs/lab-03/api-spec.md §1.5 step 6 (BR-31)
describe('a finished Ticket', () => {
  // API-37 (AC-37)
  it.each(['CLOSED', 'CANCELLED'] as const)(
    'when %s refuses a change of owner, IT Priority, or status, a Public Comment, and an Internal Note, ahead of any other 409',
    async (finished) => {
      const staff = await signInAs('IT_STAFF')
      const colleague = await createUser('IT_STAFF')
      const ticketId = await newTicket()
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: finished, ownerId: colleague.id } })
      const before = await storedTicket(ticketId)
      const post = (path: string, body: object) =>
        request(app).post(`/api/${path}`).set('Cookie', staff.cookie).send(body)

      const answers = [
        await putOwner(ticketId, staff.cookie, { ownerId: staff.user.id, expectedOwnerId: colleague.id }),
        await putOwner(ticketId, staff.cookie, { ownerId: null, expectedOwnerId: colleague.id }),
        // The owner it already has.
        await putOwner(ticketId, staff.cookie, { ownerId: colleague.id, expectedOwnerId: colleague.id }),
        // Also stale: TICKET_FINISHED comes before OWNER_CHANGED.
        await putOwner(ticketId, staff.cookie, { ownerId: staff.user.id, expectedOwnerId: null }),
        await putItPriority(ticketId, staff.cookie, { itPriority: 'HIGH' }),
        // The IT Priority it already has.
        await putItPriority(ticketId, staff.cookie, { itPriority: 'MEDIUM' }),
        // A status request that is also stale: before STATUS_CHANGED.
        await postStatus(ticketId, staff.cookie, { status: 'IN_PROGRESS', expectedStatus: 'OPEN' }),
        await post(`tickets/${ticketId}/comments`, { body: 'One more thing.' }),
        await post(`staff/tickets/${ticketId}/notes`, { body: 'One more thing.' }),
      ]
      // Every status, the one it has included.
      for (const to of STATUSES) {
        answers.push(await postStatus(ticketId, staff.cookie, transition(finished, to)))
      }

      for (const res of answers) {
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: expect.any(String), code: 'TICKET_FINISHED' })
      }
      expect(await storedTicket(ticketId)).toEqual(before)
      expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(0)
      expect(await prisma.internalNote.count({ where: { ticketId } })).toBe(0)

      // It can still be read, and offers no transition.
      const read = await detail(ticketId, staff.cookie)
      expect(read.status).toBe(200)
      expect(read.body).toMatchObject({ currentStatus: finished, allowedTransitions: [] })
    },
  )

  // api-spec.md §1.5: validation (step 5) is reported before the finished
  // check (step 6).
  it('still answers 400 for a request that is invalid', async () => {
    const staff = await signInAs('IT_STAFF')
    const requester = await createUser('REQUESTER')
    const ticketId = await newTicket()
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })

    const answers = [
      await putOwner(ticketId, staff.cookie, { ownerId: requester.id, expectedOwnerId: null }),
      await putOwner(ticketId, staff.cookie, { ownerId: staff.user.id }),
      await putItPriority(ticketId, staff.cookie, { itPriority: 'URGENT' }),
      await postStatus(ticketId, staff.cookie, { status: 'RESOLVED', expectedStatus: 'CLOSED' }),
    ]

    expect(answers.map((res) => [res.status, res.body.code, res.body.field])).toEqual([
      [400, 'VALIDATION_ERROR', 'ownerId'],
      [400, 'VALIDATION_ERROR', 'expectedOwnerId'],
      [400, 'VALIDATION_ERROR', 'itPriority'],
      [400, 'VALIDATION_ERROR', 'resolutionSummary'],
    ])
  })
})
