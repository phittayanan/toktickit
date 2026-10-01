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
      summary: 'attachments-detail.api.test ticket',
      description: 'A ticket created solely to exercise attachment download/remove.',
    })
  return res.body.id as number
}

async function uploadAttachment(ticketId: number, byRequesterId: number, filename = 'screenshot.png') {
  const res = await request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('X-Requester-Id', String(byRequesterId))
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
      filename,
      contentType: 'image/png',
    })
  return res.body.id as number
}

beforeAll(async () => {
  const requester = await prisma.user.findFirstOrThrow({ where: { isActive: true, role: 'REQUESTER' } })
  requesterId = requester.id

  const other = await prisma.user.upsert({
    where: { email: 'attachments-detail.api.test@example.com' },
    update: { isActive: true },
    create: { name: 'Attachments Detail Test Other', email: 'attachments-detail.api.test@example.com' },
  })
  otherRequesterId = other.id

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  categoryId = category.id

  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  relatedSystemId = relatedSystem.id
})

describe('GET /api/attachments/:id/download', () => {
  it('streams the file content of an active, owned Attachment', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('screenshot.png')
  })

  it('returns 404 for an Attachment owned via a Ticket belonging to a different Requester', async () => {
    const ticketId = await createTicket(otherRequesterId)
    const attachmentId = await uploadAttachment(ticketId, otherRequesterId)

    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Attachment not found')
  })

  it('returns 404 for a nonexistent Attachment id', async () => {
    const res = await request(app)
      .get('/api/attachments/999999999/download')
      .set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
  })

  it('returns 404 for a soft-removed Attachment (never serves removed content)', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'Uploaded the wrong screenshot' })

    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set('X-Requester-Id', String(requesterId))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Attachment not found')
  })
})

describe('POST /api/attachments/:id/remove', () => {
  it('soft-removes an active, owned Attachment given a valid reason', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'Uploaded the wrong screenshot' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(attachmentId)
    expect(res.body.removalReason).toBe('Uploaded the wrong screenshot')
    expect(res.body.removedByRequesterId).toBe(requesterId)
    expect(res.body.removedAt).toBeTruthy()

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    expect(row.removedAt).not.toBeNull()

    const activeCount = await prisma.attachment.count({ where: { ticketId, removedAt: null } })
    expect(activeCount).toBe(0)
  })

  it('rejects removal without a reason with a field-specific 400', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('removalReason')

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    expect(row.removedAt).toBeNull()
  })

  it('rejects a too-short reason with a field-specific 400', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'hi' })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('removalReason')
  })

  it('returns 404 for an Attachment owned via a Ticket belonging to a different Requester', async () => {
    const ticketId = await createTicket(otherRequesterId)
    const attachmentId = await uploadAttachment(ticketId, otherRequesterId)

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'Not mine to remove' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Attachment not found')
  })

  it('treats an already-removed Attachment as not-found (404)', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'First removal' })

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set('X-Requester-Id', String(requesterId))
      .send({ removalReason: 'Second removal attempt' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Attachment not found')
  })

  it('rejects a request with no X-Requester-Id header', async () => {
    const ticketId = await createTicket(requesterId)
    const attachmentId = await uploadAttachment(ticketId, requesterId)

    const res = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .send({ removalReason: 'Uploaded the wrong screenshot' })

    expect(res.status).toBe(400)
  })
})
