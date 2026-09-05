import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'

let requesterId: number
let otherRequesterId: number
let categoryId: number
let relatedSystemId: number

async function createTicket(byRequesterId: number) {
  const res = await request(app)
    .post('/api/tickets')
    .set('X-Requester-Id', String(byRequesterId))
    .send({
      categoryId,
      relatedSystemId,
      requestedPriority: 'MEDIUM',
      summary: 'ticket-detail.api.test ticket',
      description: 'A ticket created solely to exercise the ticket-detail endpoint.',
    })
  return res.body.id as number
}

beforeAll(async () => {
  const requester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } })
  requesterId = requester.id

  const other = await prisma.requesterUser.upsert({
    where: { email: 'ticket-detail.api.test@example.com' },
    update: { isActive: true },
    create: { name: 'Ticket Detail Test Other', email: 'ticket-detail.api.test@example.com' },
  })
  otherRequesterId = other.id

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  categoryId = category.id

  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  relatedSystemId = relatedSystem.id
})

describe('GET /api/tickets/:id', () => {
  // API-17 (AC-25, AC-26): full fields, active and removed Attachments both present
  it('returns full Ticket fields with both active and removed Attachments', async () => {
    const ticketId = await createTicket(requesterId)

    const activeUpload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('active file contents'), { filename: 'active.png', contentType: 'image/png' })

    const removedUpload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('removed file contents'), { filename: 'removed.png', contentType: 'image/png' })

    await prisma.attachment.update({
      where: { id: removedUpload.body.id },
      data: { removedAt: new Date(), removedByRequesterId: requesterId, removalReason: 'Wrong file' },
    })

    const res = await request(app).get(`/api/tickets/${ticketId}`).set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ticketId)
    expect(res.body.requesterId).toBe(requesterId)
    expect(res.body.categoryId).toBe(categoryId)
    expect(res.body.relatedSystemId).toBe(relatedSystemId)
    expect(res.body.summary).toBe('ticket-detail.api.test ticket')
    expect(res.body.currentStatus).toBe('NEW')

    expect(res.body.attachments).toHaveLength(2)
    const active = res.body.attachments.find((a: { id: number }) => a.id === activeUpload.body.id)
    const removed = res.body.attachments.find((a: { id: number }) => a.id === removedUpload.body.id)
    expect(active.removedAt).toBeNull()
    expect(removed.removedAt).not.toBeNull()
    expect(removed.removedByRequesterId).toBe(requesterId)
    expect(removed.removalReason).toBe('Wrong file')
  })

  // API-18 (AC-03): another Requester's Ticket -> 404, identical shape to a missing id
  it("returns a 404 for another Requester's Ticket", async () => {
    const ticketId = await createTicket(otherRequesterId)

    const res = await request(app).get(`/api/tickets/${ticketId}`).set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Ticket not found' })
  })

  // API-19 (AC-03): a nonexistent id -> identical 404 body
  it('returns an identical 404 for a nonexistent Ticket id', async () => {
    const res = await request(app).get('/api/tickets/999999999').set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Ticket not found' })
  })

  it('returns a 404 for a malformed id', async () => {
    const res = await request(app).get('/api/tickets/not-a-number').set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Ticket not found' })
  })

  // shared header contract: missing X-Requester-Id rejected 400
  it('rejects a request with no X-Requester-Id header', async () => {
    const ticketId = await createTicket(requesterId)

    const res = await request(app).get(`/api/tickets/${ticketId}`)

    expect(res.status).toBe(400)
  })
})
