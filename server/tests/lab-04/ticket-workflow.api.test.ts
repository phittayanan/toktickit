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

async function addAction(ticketId: number, status: 'PLANNED' | 'DONE') {
  const res = await request(app)
    .post(`/api/staff/tickets/${ticketId}/actions-taken`)
    .set('Cookie', staff.cookie)
    .send({
      clientRequestId: randomUUID(),
      status,
      description: 'Replace the laptop battery.',
      ...(status === 'DONE' && { result: 'The battery holds its charge.' }),
    })
  expect(res.status).toBe(201)
}

const resolve = (ticketId: number) =>
  request(app).post(`/api/staff/tickets/${ticketId}/status`).set('Cookie', staff.cookie).send({
    status: 'RESOLVED',
    expectedStatus: 'IN_PROGRESS',
    resolutionSummary: 'Replaced the battery; charge now holds for 7 hours.',
  })

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

  // AC-18, in part: WF-03 still needs each permitted status, a Cancelled one,
  // and a follow-up flagged one.
  it('resolves a Ticket with a Done Action Taken and no Planned one', async () => {
    const ticketId = await ticketInProgress()
    await addAction(ticketId, 'DONE')

    const res = await resolve(ticketId)

    expect(res.status).toBe(200)
    expect(res.body.currentStatus).toBe('RESOLVED')
  })
})
