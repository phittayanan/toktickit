import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { signInAs } from '../lab-03/support/signIn'

let activeRequesterId: number
// Lab 3: the acting Requester is the signed-in user (BR-03).
let cookie: string
let activeCategoryId: number
let inactiveCategoryId: number
let activeRelatedSystemId: number

const VALID_BODY = () => ({
  categoryId: activeCategoryId,
  relatedSystemId: activeRelatedSystemId,
  requestedPriority: 'MEDIUM',
  summary: 'Laptop battery drains quickly',
  description: 'My laptop battery is draining much faster than usual over the past week.',
})

beforeAll(async () => {
  const requester = await signInAs('REQUESTER')
  activeRequesterId = requester.user.id
  cookie = requester.cookie

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  activeCategoryId = category.id

  const inactiveCategory = await prisma.category.upsert({
    where: { name: 'create-ticket.api.test — inactive category' },
    update: { isActive: false },
    create: { name: 'create-ticket.api.test — inactive category', isActive: false },
  })
  inactiveCategoryId = inactiveCategory.id

  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  activeRelatedSystemId = relatedSystem.id
})

describe('POST /api/tickets', () => {
  // API-06 (AC-01): valid body creates a Ticket and returns its Ticket Number
  it('creates a Ticket with Current Status NEW and a TKT-YYYY-NNNNNN number', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(VALID_BODY())

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requesterId).toBe(activeRequesterId)
  })

  // API-07 (AC-10): missing Summary rejected 400 with field
  it('rejects a missing Summary with a field-specific 400', async () => {
    const { summary: _summary, ...bodyWithoutSummary } = VALID_BODY()

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(bodyWithoutSummary)

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('summary')
  })

  // API-08: inactive categoryId rejected 400
  it('rejects an inactive categoryId with a 400', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({ ...VALID_BODY(), categoryId: inactiveCategoryId })

    expect(res.status).toBe(400)
  })

  // API-10 (AC-13): two sequential creates in the same year get sequential numbers
  it('assigns sequential Ticket Numbers to two sequential creates', async () => {
    const first = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(VALID_BODY())
    const second = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send(VALID_BODY())

    const firstSeq = Number(first.body.ticketNumber.split('-')[2])
    const secondSeq = Number(second.body.ticketNumber.split('-')[2])

    expect(secondSeq).toBe(firstSeq + 1)
  })
})
