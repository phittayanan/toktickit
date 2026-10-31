import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { signInAs, type TestUser } from '../lab-03/support/signIn'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

interface Person {
  user: TestUser
  cookie: string
}

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

// The matrix of specification.md §5.4, unchanged from Lab 3.
const MATRIX: Record<Status, Status[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: [],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

const SUMMARY_OF_RESOLUTION = 'Replaced the battery; charge now holds for 7 hours.'

let categoryId: number
let relatedSystemId: number
let requester: Person
let staff: Person

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id

  requester = await signInAs('REQUESTER')
  staff = await signInAs('IT_STAFF')
})

// A Ticket In Progress, owned by `staff`.
async function ticketInProgress(): Promise<number> {
  const res = await request(app).post('/api/tickets').set('Cookie', requester.cookie).send({
    categoryId,
    relatedSystemId,
    requestedPriority: 'MEDIUM',
    summary: 'ticket-workflow.api.test ticket',
    description: 'A ticket created solely to exercise the Resolution Gate.',
  })
  expect(res.status).toBe(201)
  await prisma.ticket.update({
    where: { id: res.body.id },
    data: { currentStatus: 'IN_PROGRESS', ownerId: staff.user.id },
  })

  return res.body.id
}

async function addAction(ticketId: number, status: 'PLANNED' | 'DONE', fields: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/staff/tickets/${ticketId}/actions-taken`)
    .set('Cookie', staff.cookie)
    .send({
      clientRequestId: randomUUID(),
      status,
      description: 'Replace the laptop battery.',
      ...(status === 'DONE' && { result: 'The battery holds its charge.' }),
      ...fields,
    })
  expect(res.status).toBe(201)

  return res.body as { id: number; canEdit: boolean; status: string }
}

// A Ticket with one Done Action Taken, put in `status`.
async function gateMetTicketIn(status: Status): Promise<number> {
  const ticketId = await ticketInProgress()
  await addAction(ticketId, 'DONE')
  await setStatus(ticketId, status)

  return ticketId
}

const setStatus = (ticketId: number, currentStatus: Status) =>
  prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus } })

const storedTicket = (ticketId: number) => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

const postStatus = (ticketId: number, body: object) =>
  request(app).post(`/api/staff/tickets/${ticketId}/status`).set('Cookie', staff.cookie).send(body)

// A status request for `to` as a client that last saw `from` sends it.
const transition = (from: Status, to: Status) => ({
  status: to,
  expectedStatus: from,
  ...(to === 'RESOLVED' && { resolutionSummary: SUMMARY_OF_RESOLUTION }),
})

const resolve = (ticketId: number, from: Status = 'IN_PROGRESS') => postStatus(ticketId, transition(from, 'RESOLVED'))

describe('POST /api/staff/tickets/:id/status, the Resolution Gate', () => {
  // WF-01 (AC-16)
  it('refuses a Ticket with no Action Taken', async () => {
    const ticketId = await ticketInProgress()

    const res = await resolve(ticketId)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: expect.any(String), code: 'DONE_ACTION_REQUIRED' })
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe('IN_PROGRESS')
  })

  // WF-02 (AC-17)
  it('refuses a Ticket with a Done and a Planned Action Taken', async () => {
    const ticketId = await ticketInProgress()
    await addAction(ticketId, 'DONE')
    await addAction(ticketId, 'PLANNED')

    const res = await resolve(ticketId)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: expect.any(String), code: 'PLANNED_ACTION_REMAINS' })
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe('IN_PROGRESS')
  })

  // WF-01 (AC-16)
  it('refuses a Ticket whose only Action Taken is Cancelled', async () => {
    const ticketId = await ticketInProgress()
    const { id } = await addAction(ticketId, 'PLANNED')
    await prisma.actionTaken.update({ where: { id }, data: { status: 'CANCELLED' } })

    const res = await resolve(ticketId)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DONE_ACTION_REQUIRED')
  })

  // WF-03 (AC-18)
  it.each(['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const)(
    'resolves from %s with one Done, and a Cancelled and a follow-up flagged one have no effect',
    async (from) => {
      const ticketId = await ticketInProgress()
      await addAction(ticketId, 'DONE', { followUpRequired: true, followUpNote: 'Check the battery next month.' })
      const { id } = await addAction(ticketId, 'PLANNED')
      await prisma.actionTaken.update({ where: { id }, data: { status: 'CANCELLED' } })
      await setStatus(ticketId, from)

      const res = await resolve(ticketId, from)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ currentStatus: 'RESOLVED', resolutionSummary: SUMMARY_OF_RESOLUTION })
      expect((await storedTicket(ticketId)).resolutionSummary).toBe(SUMMARY_OF_RESOLUTION)
    },
  )

  // WF-04 (AC-19)
  describe.each(STATUSES)('from %s, with the gate satisfied', (from) => {
    it.each(STATUSES)('to %s', async (to) => {
      const ticketId = await gateMetTicketIn(from)

      const res = await postStatus(ticketId, transition(from, to))

      if (MATRIX[from].includes(to)) {
        expect(res.status).toBe(200)
        expect(res.body.currentStatus).toBe(to)
      } else {
        const code = MATRIX[from].length === 0 ? 'TICKET_FINISHED' : 'INVALID_TRANSITION'
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: expect.any(String), code })
        expect((await storedTicket(ticketId)).currentStatus).toBe(from)
      }
    })
  })

  // WF-05 (AC-16, AC-17): api-spec.md §3.1, with the gate unmet throughout.
  describe('after the Lab 3 checks', () => {
    it('answers OWNER_REQUIRED, not the gate, for a Ticket with no owner', async () => {
      const ticketId = await ticketInProgress()
      await prisma.ticket.update({ where: { id: ticketId }, data: { ownerId: null } })

      const res = await resolve(ticketId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('OWNER_REQUIRED')
    })

    it('answers STATUS_CHANGED for a stale request', async () => {
      const ticketId = await ticketInProgress()

      const res = await resolve(ticketId, 'WAITING_FOR_REQUESTER')

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('STATUS_CHANGED')
    })

    it('answers 400 for an invalid Resolution Summary', async () => {
      const ticketId = await ticketInProgress()

      const res = await postStatus(ticketId, { status: 'RESOLVED', expectedStatus: 'IN_PROGRESS', resolutionSummary: 'short' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'resolutionSummary' })
    })

    it('answers INVALID_TRANSITION for a move the matrix does not permit', async () => {
      const ticketId = await ticketInProgress()
      await setStatus(ticketId, 'OPEN')

      const res = await resolve(ticketId, 'OPEN')

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_TRANSITION')
    })

    it('answers TICKET_FINISHED for a Finished Ticket', async () => {
      const ticketId = await ticketInProgress()
      await setStatus(ticketId, 'CLOSED')

      const res = await resolve(ticketId, 'CLOSED')

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TICKET_FINISHED')
    })

    it('answers DONE_ACTION_REQUIRED ahead of PLANNED_ACTION_REMAINS', async () => {
      const ticketId = await ticketInProgress()
      await addAction(ticketId, 'PLANNED')

      const res = await resolve(ticketId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('DONE_ACTION_REQUIRED')
    })
  })

  // WF-06 (AC-20)
  it('serialises a move to Resolved with a Planned Action Taken sent in parallel', async () => {
    for (let round = 0; round < 15; round += 1) {
      const ticketId = await ticketInProgress()
      await addAction(ticketId, 'DONE')

      const [resolved] = await Promise.all([resolve(ticketId), addAction(ticketId, 'PLANNED')])

      const ticket = await storedTicket(ticketId)
      const planned = await prisma.actionTaken.findFirstOrThrow({ where: { ticketId, status: 'PLANNED' } })
      if (resolved.status === 200) {
        expect(ticket.currentStatus).toBe('RESOLVED')
        expect(planned.createdAt.getTime()).toBeGreaterThanOrEqual(ticket.resolvedAt!.getTime())
      } else {
        expect(resolved.status).toBe(409)
        expect(resolved.body.code).toBe('PLANNED_ACTION_REMAINS')
        expect(ticket.currentStatus).toBe('IN_PROGRESS')
      }
    }
  })

  // WF-07 (AC-21)
  it('is not satisfied by the Requester indicating Problem Appears Resolved', async () => {
    const ticketId = await ticketInProgress()

    const indicated = await request(app)
      .put(`/api/tickets/${ticketId}/resolution-indication`)
      .set('Cookie', requester.cookie)
    expect(indicated.status).toBe(200)
    const flagged = await storedTicket(ticketId)
    expect(flagged.currentStatus).toBe('IN_PROGRESS')
    expect(flagged.requesterResolvedAt).not.toBeNull()

    const res = await resolve(ticketId)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DONE_ACTION_REQUIRED')
    expect((await storedTicket(ticketId)).currentStatus).toBe('IN_PROGRESS')
  })

  // WF-08 (AC-22): written directly, as the Lab 3 rows the migration leaves.
  describe('a legacy Ticket with no Action Taken', () => {
    it.each(['CLOSED', 'REOPENED'] as const)('moves from Resolved to %s', async (to) => {
      const ticketId = await ticketInProgress()
      await setStatus(ticketId, 'RESOLVED')

      const res = await postStatus(ticketId, transition('RESOLVED', to))

      expect(res.status).toBe(200)
      expect(res.body.currentStatus).toBe(to)
    })

    it('moves from In Progress to Resolved only once it has a Done Action Taken', async () => {
      const ticketId = await ticketInProgress()

      const refused = await resolve(ticketId)
      expect(refused.status).toBe(409)
      expect(refused.body.code).toBe('DONE_ACTION_REQUIRED')

      await addAction(ticketId, 'DONE')
      expect((await resolve(ticketId)).status).toBe(200)
    })
  })

  // WF-09 (AC-23)
  it('counts an earlier Done Action Taken after a reopening, until a new Planned one is added', async () => {
    const ticketId = await gateMetTicketIn('IN_PROGRESS')
    expect((await resolve(ticketId)).status).toBe(200)
    expect((await postStatus(ticketId, transition('RESOLVED', 'REOPENED'))).status).toBe(200)

    expect((await resolve(ticketId, 'REOPENED')).status).toBe(200)

    expect((await postStatus(ticketId, transition('RESOLVED', 'REOPENED'))).status).toBe(200)
    await addAction(ticketId, 'PLANNED')
    const res = await resolve(ticketId, 'REOPENED')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PLANNED_ACTION_REMAINS')
  })

  // WF-10 (AC-24)
  it('leaves a Resolved Ticket alone when a Planned Action Taken is added, and that does not stop it being Closed', async () => {
    const ticketId = await gateMetTicketIn('IN_PROGRESS')
    expect((await resolve(ticketId)).status).toBe(200)

    const { id, canEdit } = await addAction(ticketId, 'PLANNED')
    expect(canEdit).toBe(true)
    expect((await storedTicket(ticketId)).currentStatus).toBe('RESOLVED')

    const closed = await postStatus(ticketId, transition('RESOLVED', 'CLOSED'))
    expect(closed.status).toBe(200)

    const actions = await request(app).get(`/api/tickets/${ticketId}/actions-taken`).set('Cookie', staff.cookie)
    expect(actions.body.find((action: { id: number }) => action.id === id)).toMatchObject({
      status: 'PLANNED',
      canEdit: false,
    })
  })

  // WF-11 (AC-25)
  it('GET /api/staff/tickets/:id counts Planned and Done Actions Taken, and the matrix ignores the gate', async () => {
    const ticketId = await ticketInProgress()
    const get = () => request(app).get(`/api/staff/tickets/${ticketId}`).set('Cookie', staff.cookie)

    expect((await get()).body).toMatchObject({
      actionTakenCounts: { planned: 0, done: 0 },
      allowedTransitions: MATRIX.IN_PROGRESS,
    })

    await addAction(ticketId, 'DONE')
    await addAction(ticketId, 'DONE')
    await addAction(ticketId, 'PLANNED')
    const { id } = await addAction(ticketId, 'PLANNED')
    await prisma.actionTaken.update({ where: { id }, data: { status: 'CANCELLED' } })

    expect((await get()).body).toMatchObject({
      actionTakenCounts: { planned: 1, done: 2 },
      allowedTransitions: MATRIX.IN_PROGRESS,
    })
  })
})
