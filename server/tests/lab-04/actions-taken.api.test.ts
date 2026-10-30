import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { resetClock } from '../../src/clock'
import { installFakeClock } from '../lab-03/support/clock'
import { createUser, signInAs, type TestUser } from '../lab-03/support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

interface Person {
  user: TestUser
  cookie: string
}

const NONEXISTENT_ID = 999999999
const ASSIGNEE_MESSAGE = 'Performed by must be an active IT Staff or Administrator user.'

let categoryId: number
let relatedSystemId: number
let requester: Person
let otherRequester: Person
let creator: Person
let assignee: Person
let ticketOwner: Person
let otherStaff: Person
let administrator: Person

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id

  requester = await signInAs('REQUESTER')
  otherRequester = await signInAs('REQUESTER')
  creator = await signInAs('IT_STAFF')
  assignee = await signInAs('IT_STAFF')
  ticketOwner = await signInAs('IT_STAFF')
  otherStaff = await signInAs('IT_STAFF')
  administrator = await signInAs('ADMINISTRATOR')
})

afterEach(() => {
  resetClock()
  vi.restoreAllMocks()
})

async function createTicket(): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', requester.cookie).send({
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'actions-taken.api.test ticket',
    description: 'A ticket created solely to exercise Actions Taken.',
  })
  expect(res.status).toBe(201)

  return res.body.id
}

const createBody = (fields: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  status: 'PLANNED',
  description: 'Replace the laptop battery.',
  ...fields,
})

const postAction = (ticketId: number, cookie: string, fields: Record<string, unknown> = {}) =>
  request(app)
    .post(`/api/staff/tickets/${ticketId}/actions-taken`)
    .set('Cookie', cookie)
    .send(createBody(fields))

const list = (ticketId: number, cookie: string) =>
  request(app).get(`/api/tickets/${ticketId}/actions-taken`).set('Cookie', cookie)

// A Planned Action Taken by `creator`, performed by `assignee`, on a new
// Ticket owned by `ticketOwner`.
async function plannedAction() {
  const ticketId = await createTicket()
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { currentStatus: 'IN_PROGRESS', ownerId: ticketOwner.user.id },
  })
  const res = await postAction(ticketId, creator.cookie, { assigneeId: assignee.user.id })
  expect(res.status).toBe(201)

  return { ticketId, action: res.body }
}

// The full PUT body of an Action Taken as the API returned it.
const editBody = (action: Record<string, any>, fields: Record<string, unknown> = {}) => ({
  expectedVersion: action.version,
  actionAt: action.actionAt,
  description: action.description,
  result: action.result,
  status: action.status,
  assigneeId: action.assignee.id,
  followUpRequired: action.followUpRequired,
  followUpNote: action.followUpNote,
  attachmentNotes: action.attachmentNotes,
  ...fields,
})

const putAction = (
  ticketId: number,
  action: Record<string, any>,
  cookie: string,
  fields: Record<string, unknown> = {},
) =>
  request(app)
    .put(`/api/staff/tickets/${ticketId}/actions-taken/${action.id}`)
    .set('Cookie', cookie)
    .send(editBody(action, fields))

const storedAction = (id: number) => prisma.actionTaken.findUniqueOrThrow({ where: { id } })
const storedTicket = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } })
const countOn = (ticketId: number) => prisma.actionTaken.count({ where: { ticketId } })

describe('GET /api/tickets/:id/actions-taken', () => {
  // API-01 (AC-13, BR-16)
  it('gives a Requester every Action Taken of their own Ticket with every field', async () => {
    const ticketId = await createTicket()
    const done = await postAction(ticketId, creator.cookie, {
      status: 'DONE',
      result: 'Charge now holds for 7 hours.',
      assigneeId: assignee.user.id,
      followUpRequired: true,
      followUpNote: 'Check the charge again next week.',
      attachmentNotes: 'See battery-report.pdf.',
      actionAt: '2026-10-30T09:00:00+07:00',
    })
    const planned = await postAction(ticketId, creator.cookie)
    const cancelled = await postAction(ticketId, creator.cookie)
    const withdrawn = await putAction(ticketId, cancelled.body, creator.cookie, { status: 'CANCELLED' })
    expect(withdrawn.status).toBe(200)

    const res = await list(ticketId, requester.cookie)

    expect(res.status).toBe(200)
    expect(res.body.map((action: { status: string }) => action.status).sort()).toEqual([
      'CANCELLED',
      'DONE',
      'PLANNED',
    ])
    expect(res.body.map((action: { id: number }) => action.id)).toEqual([
      cancelled.body.id,
      planned.body.id,
      done.body.id,
    ])
    for (const action of res.body) {
      expect(action.canEdit).toBe(false)
    }
    expect(res.body[2]).toEqual({
      id: done.body.id,
      actionAt: '2026-10-30T02:00:00.000Z',
      description: 'Replace the laptop battery.',
      result: 'Charge now holds for 7 hours.',
      status: 'DONE',
      assignee: { id: assignee.user.id, name: assignee.user.name },
      followUpRequired: true,
      followUpNote: 'Check the charge again next week.',
      attachmentNotes: 'See battery-report.pdf.',
      createdBy: { id: creator.user.id, name: creator.user.name },
      createdAt: expect.any(String),
      version: 1,
      canEdit: false,
    })
  })

  // API-02 (AC-12, BR-02, BR-15)
  it('lists several staff members’ Actions Taken newest created first, ties by id, leaving the owner', async () => {
    const { ticketId } = await plannedAction()
    await postAction(ticketId, otherStaff.cookie)
    await postAction(ticketId, administrator.cookie)
    // Two rows with one creation time: the higher id comes first.
    installFakeClock(new Date(Date.now() + 60_000))
    const firstTied = await postAction(ticketId, assignee.cookie)
    const secondTied = await postAction(ticketId, assignee.cookie)

    const res = await list(ticketId, otherStaff.cookie)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(5)
    expect(res.body[0].id).toBe(secondTied.body.id)
    expect(res.body[1].id).toBe(firstTied.body.id)
    expect(res.body[2].createdBy.id).toBe(administrator.user.id)
    expect(res.body[3].createdBy.id).toBe(otherStaff.user.id)
    expect(res.body[4].createdBy.id).toBe(creator.user.id)
    expect((await storedTicket(ticketId)).ownerId).toBe(ticketOwner.user.id)
  })

  it('answers an empty list for a Ticket with none', async () => {
    const res = await list(await createTicket(), requester.cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('tells each staff member what they may edit', async () => {
    const { ticketId, action } = await plannedAction()

    const canEdit = async (cookie: string) => (await list(ticketId, cookie)).body[0].canEdit

    expect(await canEdit(creator.cookie)).toBe(true)
    expect(await canEdit(assignee.cookie)).toBe(true)
    expect(await canEdit(administrator.cookie)).toBe(true)
    expect(await canEdit(ticketOwner.cookie)).toBe(false)
    expect(await canEdit(otherStaff.cookie)).toBe(false)

    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })
    expect(await canEdit(administrator.cookie)).toBe(false)

    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'IN_PROGRESS' } })
    await putAction(ticketId, action, creator.cookie, { status: 'CANCELLED' })
    expect(await canEdit(creator.cookie)).toBe(false)
  })

  // API-16 (AC-14, BR-16)
  it('answers another Requester’s Ticket exactly as a nonexistent one', async () => {
    const ticketId = await createTicket()

    const theirs = await list(ticketId, otherRequester.cookie)
    const missing = await list(NONEXISTENT_ID, otherRequester.cookie)
    const malformed = await list('abc' as unknown as number, otherRequester.cookie)

    expect(theirs.status).toBe(404)
    expect(theirs.body).toEqual({ error: 'Ticket not found', code: 'NOT_FOUND' })
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual(theirs.body)
    expect(malformed.status).toBe(404)
    expect(malformed.body).toEqual(theirs.body)
  })
})

describe('POST /api/staff/tickets/:id/actions-taken', () => {
  // API-03 (AC-01, BR-04, BR-05)
  it('creates an Action Taken performed by the session user by default', async () => {
    const ticketId = await createTicket()
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await postAction(ticketId, creator.cookie)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'PLANNED',
      assignee: { id: creator.user.id, name: creator.user.name },
      createdBy: { id: creator.user.id, name: creator.user.name },
      createdAt: serverTime.toISOString(),
      version: 1,
      canEdit: true,
    })
    const stored = await storedAction(res.body.id)
    expect(stored.ticketId).toBe(ticketId)
    expect((await storedTicket(ticketId)).updatedAt).toEqual(serverTime)
  })

  // API-03 (AC-01, BR-04)
  it('creates an Action Taken performed by another active staff user', async () => {
    const ticketId = await createTicket()

    const staff = await postAction(ticketId, creator.cookie, { assigneeId: assignee.user.id })
    const admin = await postAction(ticketId, creator.cookie, { assigneeId: administrator.user.id })

    expect(staff.status).toBe(201)
    expect(staff.body.assignee.id).toBe(assignee.user.id)
    expect(staff.body.createdBy.id).toBe(creator.user.id)
    expect(admin.status).toBe(201)
    expect(admin.body.assignee.id).toBe(administrator.user.id)
  })

  // API-04 (AC-02, BR-05)
  it('ignores a forged creator, created time, version, and Ticket', async () => {
    const ticketId = await createTicket()
    const otherTicketId = await createTicket()

    const res = await postAction(ticketId, creator.cookie, {
      createdById: otherStaff.user.id,
      createdBy: { id: otherStaff.user.id },
      createdAt: '2020-01-01T00:00:00.000Z',
      version: 42,
      ticketId: otherTicketId,
      id: 1,
    })

    expect(res.status).toBe(201)
    expect(res.body.createdBy.id).toBe(creator.user.id)
    expect(res.body.createdAt).not.toBe('2020-01-01T00:00:00.000Z')
    expect(res.body.version).toBe(1)
    expect((await storedAction(res.body.id)).ticketId).toBe(ticketId)
    expect(await countOn(otherTicketId)).toBe(0)
  })

  // API-05 (AC-03)
  it.each([
    ['description', { description: undefined }],
    ['description', { description: '   ' }],
    ['description', { description: 'x'.repeat(2001) }],
    ['result', { result: 'x'.repeat(2001) }],
    ['result', { status: 'DONE' }],
    ['result', { status: 'DONE', result: '   ' }],
    ['followUpNote', { followUpRequired: true }],
    ['followUpNote', { followUpRequired: true, followUpNote: 'x'.repeat(2001) }],
    ['followUpNote', { followUpRequired: false, followUpNote: 'Check again.' }],
    ['attachmentNotes', { attachmentNotes: 'x'.repeat(501) }],
    ['status', { status: 'CANCELLED' }],
    ['status', { status: undefined }],
    ['followUpRequired', { followUpRequired: 'yes' }],
  ])('refuses a bad %s, %#, naming it and saving nothing', async (field, fields) => {
    const ticketId = await createTicket()
    const before = await storedTicket(ticketId)

    const res = await postAction(ticketId, creator.cookie, fields)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field })
    expect(await countOn(ticketId)).toBe(0)
    expect((await storedTicket(ticketId)).updatedAt).toEqual(before.updatedAt)
  })

  // api-spec.md §1.3 step 5
  it.each([[undefined], ['not-a-uuid']])('refuses a clientRequestId of %j', async (clientRequestId) => {
    const ticketId = await createTicket()

    const res = await postAction(ticketId, creator.cookie, { clientRequestId })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'clientRequestId' })
  })

  // API-06 (AC-04, BR-06)
  it('defaults Action Date/Time to now, takes a future Planned, and refuses a future Done', async () => {
    const ticketId = await createTicket()
    const serverTime = new Date(Date.now() + 60_000)
    installFakeClock(serverTime)

    const byDefault = await postAction(ticketId, creator.cookie)
    expect(byDefault.status).toBe(201)
    expect(byDefault.body.actionAt).toBe(serverTime.toISOString())

    const future = new Date(serverTime.getTime() + 1000).toISOString()
    const planned = await postAction(ticketId, creator.cookie, { actionAt: future })
    expect(planned.status).toBe(201)
    expect(planned.body.actionAt).toBe(future)

    const done = await postAction(ticketId, creator.cookie, { status: 'DONE', result: 'It works.', actionAt: future })
    expect(done.status).toBe(400)
    expect(done.body).toEqual({
      error: 'A Done action cannot be dated in the future.',
      code: 'VALIDATION_ERROR',
      field: 'actionAt',
    })

    const doneNow = await postAction(ticketId, creator.cookie, {
      status: 'DONE',
      result: 'It works.',
      actionAt: serverTime.toISOString(),
    })
    expect(doneNow.status).toBe(201)
  })

  // API-07 (AC-05, BR-04)
  it('refuses an inactive, Requester, or unknown assignee with one message', async () => {
    const ticketId = await createTicket()
    const inactive = await createUser('IT_STAFF', { isActive: false })

    for (const assigneeId of [inactive.id, requester.user.id, NONEXISTENT_ID, 2147483648]) {
      const res = await postAction(ticketId, creator.cookie, { assigneeId })

      expect(res.status, String(assigneeId)).toBe(400)
      expect(res.body).toEqual({ error: ASSIGNEE_MESSAGE, code: 'VALIDATION_ERROR', field: 'assigneeId' })
    }
    expect(await countOn(ticketId)).toBe(0)
  })

  // API-18 (AC-12, BR-02)
  it('takes an Action Taken on an unassigned Ticket and one performed by someone else', async () => {
    const unassigned = await createTicket()
    const owned = await createTicket()
    await prisma.ticket.update({ where: { id: owned }, data: { ownerId: ticketOwner.user.id, currentStatus: 'OPEN' } })

    expect((await postAction(unassigned, otherStaff.cookie)).status).toBe(201)
    expect((await postAction(owned, otherStaff.cookie, { assigneeId: assignee.user.id })).status).toBe(201)

    expect((await storedTicket(unassigned)).ownerId).toBeNull()
    expect(await storedTicket(unassigned)).toMatchObject({ currentStatus: 'NEW' })
    expect(await storedTicket(owned)).toMatchObject({ ownerId: ticketOwner.user.id, currentStatus: 'OPEN' })
  })

  // API-13 (AC-10, BR-12)
  it.each([['CLOSED'], ['CANCELLED']] as const)('refuses a new key on a %s Ticket', async (currentStatus) => {
    const ticketId = await createTicket()
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus } })

    const res = await postAction(ticketId, creator.cookie)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TICKET_FINISHED')
    expect(await countOn(ticketId)).toBe(0)
  })

  // api-spec.md §1.3: body validation is step 7, the Finished check step 8.
  it('answers a bad body on a Finished Ticket 400, ahead of TICKET_FINISHED', async () => {
    const ticketId = await createTicket()
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })

    const bad = await postAction(ticketId, creator.cookie, { description: '' })
    const badAssignee = await postAction(ticketId, creator.cookie, { assigneeId: NONEXISTENT_ID })

    expect(bad.status).toBe(400)
    expect(badAssignee.status).toBe(400)
    expect(badAssignee.body.field).toBe('assigneeId')
  })

  // API-14 (AC-11, BR-14)
  it('makes one record of the same key sent in sequence', async () => {
    const ticketId = await createTicket()
    const clientRequestId = randomUUID()

    const first = await postAction(ticketId, creator.cookie, { clientRequestId })
    const updatedAt = (await storedTicket(ticketId)).updatedAt
    const second = await postAction(ticketId, creator.cookie, { clientRequestId })

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(await countOn(ticketId)).toBe(1)
    expect((await storedTicket(ticketId)).updatedAt).toEqual(updatedAt)
  })

  // API-14 (AC-11, BR-14)
  it('makes one record of the same key sent in parallel', async () => {
    const ticketId = await createTicket()
    const clientRequestId = randomUUID()

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postAction(ticketId, creator.cookie, { clientRequestId })),
    )

    const statuses = responses.map((res) => res.status).sort()
    expect(statuses).toEqual([200, 200, 200, 200, 201])
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1)
    expect(await countOn(ticketId)).toBe(1)
  })

  // API-14 (AC-11, BR-14)
  it('gives another Ticket its own record for the same key', async () => {
    const ticketId = await createTicket()
    const otherTicketId = await createTicket()
    const clientRequestId = randomUUID()

    const first = await postAction(ticketId, creator.cookie, { clientRequestId })
    const second = await postAction(otherTicketId, creator.cookie, { clientRequestId })

    expect(second.status).toBe(201)
    expect(second.body.id).not.toBe(first.body.id)
  })

  // API-15 (AC-11, BR-14)
  it('answers a committed key with the record, whatever the body says', async () => {
    const ticketId = await createTicket()
    const clientRequestId = randomUUID()
    const first = await postAction(ticketId, creator.cookie, { clientRequestId })

    const res = await postAction(ticketId, creator.cookie, {
      clientRequestId,
      status: 'CANCELLED',
      description: '',
      assigneeId: NONEXISTENT_ID,
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(first.body)
    expect(await countOn(ticketId)).toBe(1)
  })

  // API-15 (AC-11, BR-14)
  it('answers a committed key with the record after the Ticket became Finished', async () => {
    const ticketId = await createTicket()
    const clientRequestId = randomUUID()
    const first = await postAction(ticketId, creator.cookie, { clientRequestId })
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })
    const updatedAt = (await storedTicket(ticketId)).updatedAt

    const res = await postAction(ticketId, creator.cookie, { clientRequestId })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ...first.body, canEdit: false })
    expect((await storedTicket(ticketId)).updatedAt).toEqual(updatedAt)
  })

  // Nothing but the database stands between two copies of a retry that both
  // missed the lookup, so a loss on the constraint must read as a repeat.
  it('answers a repeat that loses on the unique constraint as a repeat', async () => {
    const ticketId = await createTicket()
    const clientRequestId = randomUUID()
    const first = await postAction(ticketId, creator.cookie, { clientRequestId })
    const lookup = vi.spyOn(prisma.actionTaken, 'findUnique').mockResolvedValueOnce(null)

    const res = await postAction(ticketId, creator.cookie, { clientRequestId })

    expect(lookup).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body).toEqual(first.body)
    expect(await countOn(ticketId)).toBe(1)
  })

  it('answers a missing or malformed Ticket 404', async () => {
    for (const ticketId of [NONEXISTENT_ID, 'abc']) {
      const res = await postAction(ticketId as number, creator.cookie)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Ticket not found', code: 'NOT_FOUND' })
    }
  })

  // BR-18
  it('takes no Action Taken from a Requester, even on their own Ticket', async () => {
    const ticketId = await createTicket()

    const res = await postAction(ticketId, requester.cookie)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(await countOn(ticketId)).toBe(0)
  })

  // API-17 (AC-15, BR-37)
  it('stores and returns markup verbatim', async () => {
    const ticketId = await createTicket()
    const markup = '<script>alert("x")</script><b>bold</b>\n&amp;'

    const res = await postAction(ticketId, creator.cookie, {
      status: 'DONE',
      description: markup,
      result: markup,
      attachmentNotes: markup,
      followUpRequired: true,
      followUpNote: markup,
    })

    expect(res.status).toBe(201)
    const [listed] = (await list(ticketId, requester.cookie)).body
    for (const field of ['description', 'result', 'attachmentNotes', 'followUpNote']) {
      expect(listed[field]).toBe(markup)
    }
  })

  // The module's fixed order (ticketChange.service.ts): the Users a change
  // depends on are locked ahead of the Ticket.
  it('takes the assignee and the creator before the Ticket', async () => {
    const ticketId = await createTicket()

    for (const locked of [assignee.user.id, creator.user.id]) {
      let change!: Promise<request.Response>
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${locked} FOR UPDATE`

          change = postAction(ticketId, creator.cookie, { assigneeId: assignee.user.id }).then((res) => res)
          await vi.waitFor(
            async () => {
              const [{ waiting }] = await tx.$queryRaw<{ waiting: number }[]>`
                SELECT count(*)::int AS "waiting" FROM pg_stat_activity
                WHERE pg_backend_pid() = ANY(pg_blocking_pids("pid"))`
              expect(waiting).toBe(1)
            },
            { timeout: 5_000, interval: 50 },
          )

          const unlocked = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE SKIP LOCKED`
          expect(unlocked).toEqual([{ id: ticketId }])
        },
        { timeout: 10_000 },
      )

      expect((await change).status).toBe(201)
    }
  })

  // API-20 (AC-45, BR-34)
  it('answers a database failure with the generic body', async () => {
    const ticketId = await createTicket()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED postgres://secret@db:5432/toktickit'),
    )

    const res = await postAction(ticketId, creator.cookie)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' })
  })
})

describe('PUT /api/staff/tickets/:id/actions-taken/:actionTakenId', () => {
  // API-09 (AC-06, BR-15)
  it.each([
    ['its creator', () => creator],
    ['its assignee', () => assignee],
    ['an Administrator', () => administrator],
  ])('saves an edit by %s, raising the version and moving Last Updated', async (_who, person) => {
    const { ticketId, action } = await plannedAction()
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await putAction(ticketId, action, person().cookie, { description: 'Replace the charger instead.' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: action.id,
      description: 'Replace the charger instead.',
      version: 2,
      createdAt: action.createdAt,
      createdBy: action.createdBy,
      canEdit: true,
    })
    const stored = await storedAction(action.id)
    expect(stored.version).toBe(2)
    expect(stored.updatedAt).toEqual(serverTime)
    expect((await storedTicket(ticketId)).updatedAt).toEqual(serverTime)
  })

  // API-09 (AC-06, BR-15)
  it.each([
    ['the Ticket Owner', () => ticketOwner],
    ['another IT Staff user', () => otherStaff],
  ])('refuses %s and changes nothing', async (_who, person) => {
    const { ticketId, action } = await plannedAction()
    const before = await storedAction(action.id)
    const ticketBefore = await storedTicket(ticketId)

    const res = await putAction(ticketId, action, person().cookie, { description: 'Not mine to change.' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({
      error: 'Only the creator, the person performing it, or an Administrator can edit this action.',
      code: 'ACTION_TAKEN_EDIT_FORBIDDEN',
    })
    expect(await storedAction(action.id)).toEqual(before)
    expect((await storedTicket(ticketId)).updatedAt).toEqual(ticketBefore.updatedAt)
  })

  // API-10 (AC-07, BR-08, BR-10)
  it('marks Done with a Result, and then nobody can edit it', async () => {
    const { ticketId, action } = await plannedAction()

    const done = await putAction(ticketId, action, assignee.cookie, { status: 'DONE', result: 'It works.' })

    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ status: 'DONE', result: 'It works.', version: 2, canEdit: false })
    const before = await storedAction(action.id)

    for (const person of [creator, assignee, administrator]) {
      const res = await putAction(ticketId, done.body, person.cookie, { description: 'Changed my mind.' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({
        error: 'A Done or Cancelled action can no longer be changed.',
        code: 'ACTION_TAKEN_FINAL',
      })
    }
    expect(await storedAction(action.id)).toEqual(before)
  })

  // API-10 (AC-07, BR-08, BR-10, BR-18)
  it('cancels, and then nobody can edit it, others still hearing 403', async () => {
    const { ticketId, action } = await plannedAction()

    const cancelled = await putAction(ticketId, action, creator.cookie, { status: 'CANCELLED' })

    expect(cancelled.status).toBe(200)
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', version: 2, canEdit: false })

    for (const person of [creator, assignee, administrator]) {
      const res = await putAction(ticketId, cancelled.body, person.cookie, { status: 'PLANNED' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ACTION_TAKEN_FINAL')
    }
    const refused = await putAction(ticketId, cancelled.body, otherStaff.cookie)
    expect(refused.status).toBe(403)
  })

  it('refuses Done with no Result', async () => {
    const { ticketId, action } = await plannedAction()

    const res = await putAction(ticketId, action, creator.cookie, { status: 'DONE' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'result' })
    expect((await storedAction(action.id)).status).toBe('PLANNED')
  })

  // API-06 (AC-04, BR-06)
  it('refuses Done with a future time, and takes it for Planned and Cancelled', async () => {
    const { ticketId, action } = await plannedAction()
    const future = new Date(Date.now() + 60 * 60_000).toISOString()

    const done = await putAction(ticketId, action, creator.cookie, {
      status: 'DONE',
      result: 'It works.',
      actionAt: future,
    })
    expect(done.status).toBe(400)
    expect(done.body.field).toBe('actionAt')

    const planned = await putAction(ticketId, action, creator.cookie, { actionAt: future })
    expect(planned.status).toBe(200)
    expect(planned.body.actionAt).toBe(future)

    const cancelled = await putAction(ticketId, planned.body, creator.cookie, { status: 'CANCELLED' })
    expect(cancelled.status).toBe(200)
  })

  // API-07 (AC-05, BR-04)
  it('refuses an ineligible new assignee with the create message', async () => {
    const { ticketId, action } = await plannedAction()
    const inactive = await createUser('IT_STAFF', { isActive: false })

    for (const assigneeId of [inactive.id, requester.user.id, NONEXISTENT_ID]) {
      const res = await putAction(ticketId, action, creator.cookie, { assigneeId })

      expect(res.status, String(assigneeId)).toBe(400)
      expect(res.body).toEqual({ error: ASSIGNEE_MESSAGE, code: 'VALIDATION_ERROR', field: 'assigneeId' })
    }
    expect((await storedAction(action.id)).version).toBe(1)
  })

  // API-08 (AC-05, BR-04)
  it('keeps an assignee who has since become ineligible, then lets it change', async () => {
    const ticketId = await createTicket()
    const leaver = await createUser('IT_STAFF')
    const created = await postAction(ticketId, creator.cookie, { assigneeId: leaver.id })
    await prisma.user.update({ where: { id: leaver.id }, data: { isActive: false } })

    const kept = await putAction(ticketId, created.body, creator.cookie, { description: 'Still planned.' })

    expect(kept.status).toBe(200)
    expect(kept.body.assignee.id).toBe(leaver.id)

    const changed = await putAction(ticketId, kept.body, creator.cookie, { assigneeId: assignee.user.id })

    expect(changed.status).toBe(200)
    expect(changed.body.assignee.id).toBe(assignee.user.id)
  })

  // API-12 (AC-09, BR-13)
  it('refuses the second of two edits from one version, keeping the first', async () => {
    const { ticketId, action } = await plannedAction()

    const first = await putAction(ticketId, action, creator.cookie, { description: 'First edit.' })
    const second = await putAction(ticketId, action, assignee.cookie, { description: 'Second edit.' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(second.body).toEqual({
      error: 'This action was changed by someone else. Reload to see the latest version.',
      code: 'ACTION_TAKEN_CHANGED',
    })
    expect(await storedAction(action.id)).toMatchObject({ description: 'First edit.', version: 2 })
  })

  it('lets one of two edits from one version sent in parallel win', async () => {
    const { ticketId, action } = await plannedAction()

    const responses = await Promise.all([
      putAction(ticketId, action, creator.cookie, { description: 'Edit A.' }),
      putAction(ticketId, action, assignee.cookie, { description: 'Edit B.' }),
    ])

    expect(responses.map((res) => res.status).sort()).toEqual([200, 409])
    expect((await storedAction(action.id)).version).toBe(2)
  })

  // API-13 (AC-10, BR-12)
  it.each([['CLOSED'], ['CANCELLED']] as const)(
    'answers TICKET_FINISHED on a %s Ticket ahead of any other refusal',
    async (currentStatus) => {
      const { ticketId, action } = await plannedAction()
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus } })

      const current = await putAction(ticketId, action, creator.cookie, { description: 'Too late.' })
      const stale = await putAction(ticketId, action, creator.cookie, { expectedVersion: 7 })
      const forbidden = await putAction(ticketId, action, otherStaff.cookie)

      for (const res of [current, stale, forbidden]) {
        expect(res.status).toBe(409)
        expect(res.body.code).toBe('TICKET_FINISHED')
      }
      expect(await storedAction(action.id)).toMatchObject({ status: 'PLANNED', version: 1 })
    },
  )

  // api-spec.md §1.3: forbidden, then stale, then final.
  it('checks the right to edit, then the version, then finality', async () => {
    const { ticketId, action } = await plannedAction()
    const done = await putAction(ticketId, action, creator.cookie, { status: 'DONE', result: 'It works.' })

    const forbidden = await putAction(ticketId, done.body, otherStaff.cookie, { expectedVersion: 1 })
    const stale = await putAction(ticketId, done.body, creator.cookie, { expectedVersion: 1 })

    expect(forbidden.body.code).toBe('ACTION_TAKEN_EDIT_FORBIDDEN')
    expect(stale.body.code).toBe('ACTION_TAKEN_CHANGED')
  })

  it('answers a bad body on a Finished Ticket 400, ahead of TICKET_FINISHED', async () => {
    const { ticketId, action } = await plannedAction()
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })

    const res = await putAction(ticketId, action, creator.cookie, { description: '' })

    expect(res.status).toBe(400)
  })

  // API-19 (AC-44, BR-01)
  it('answers an Action Taken under another Ticket, and missing ids, 404', async () => {
    const { action } = await plannedAction()
    const otherTicketId = await createTicket()

    const mismatch = await putAction(otherTicketId, action, creator.cookie)
    const noTicket = await putAction(NONEXISTENT_ID, action, creator.cookie)
    const noAction = await putAction(otherTicketId, { ...action, id: NONEXISTENT_ID }, creator.cookie)
    const malformed = await putAction(otherTicketId, { ...action, id: 'abc' }, creator.cookie)

    expect(mismatch.status).toBe(404)
    expect(mismatch.body).toEqual({ error: 'Action Taken not found', code: 'NOT_FOUND' })
    expect(noTicket.status).toBe(404)
    expect(noTicket.body).toEqual({ error: 'Ticket not found', code: 'NOT_FOUND' })
    expect(noAction.body).toEqual(mismatch.body)
    expect(malformed.body).toEqual(mismatch.body)
    expect((await storedAction(action.id)).version).toBe(1)
  })

  // BR-18
  it('takes no edit from a Requester, even on their own Ticket', async () => {
    const { ticketId, action } = await plannedAction()

    const res = await putAction(ticketId, action, requester.cookie)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect((await storedAction(action.id)).version).toBe(1)
  })

  // API-11 (AC-08, BR-11)
  it('has no DELETE, and a Cancelled action stays listed', async () => {
    const { ticketId, action } = await plannedAction()
    const cancelled = await putAction(ticketId, action, creator.cookie, { status: 'CANCELLED' })

    const paths = [
      `/api/staff/tickets/${ticketId}/actions-taken/${action.id}`,
      `/api/staff/tickets/${ticketId}/actions-taken`,
      `/api/tickets/${ticketId}/actions-taken`,
      `/api/tickets/${ticketId}/actions-taken/${action.id}`,
    ]
    for (const path of paths) {
      const res = await request(app).delete(path).set('Cookie', administrator.cookie)

      expect(res.status, path).toBe(404)
    }

    const [listed] = (await list(ticketId, requester.cookie)).body
    expect(listed.id).toBe(cancelled.body.id)
    expect(listed.status).toBe('CANCELLED')
  })

  // API-20 (AC-45, BR-34)
  it('answers a database failure with the generic body', async () => {
    const { ticketId, action } = await plannedAction()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED postgres://secret@db:5432/toktickit'),
    )

    const res = await putAction(ticketId, action, creator.cookie)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' })
    expect((await storedAction(action.id)).version).toBe(1)
  })
})
