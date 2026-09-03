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
      summary: 'attachments.api.test ticket',
      description: 'A ticket created solely to exercise the attachments endpoint.',
    })
  return res.body.id as number
}

beforeAll(async () => {
  const requester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } })
  requesterId = requester.id

  const other = await prisma.requesterUser.upsert({
    where: { email: 'attachments.api.test@example.com' },
    update: { isActive: true },
    create: { name: 'Attachments Test Other', email: 'attachments.api.test@example.com' },
  })
  otherRequesterId = other.id

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  categoryId = category.id

  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  relatedSystemId = relatedSystem.id
})

describe('POST /api/tickets/:id/attachments', () => {
  // API-20: valid file upload succeeds
  it('uploads a valid PNG and returns 201 with the Attachment', async () => {
    const ticketId = await createTicket(requesterId)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(201)
    expect(res.body.ticketId).toBe(ticketId)
    expect(res.body.originalFilename).toBe('screenshot.png')
    expect(res.body.mimeType).toBe('image/png')
  })

  // API-21: unsupported MIME type rejected before upload
  it('rejects an unsupported file type with a field-specific 400', async () => {
    const ticketId = await createTicket(requesterId)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('file')
  })

  // API-22: oversized file rejected
  it('rejects a file over 5 MB with a field-specific 400', async () => {
    const ticketId = await createTicket(requesterId)
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', oversized, { filename: 'big.png', contentType: 'image/png' })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('file')
  })

  // API-23: the 6th upload against a 5-limit Ticket is rejected, and the
  // count stays at 5.
  it('rejects a 6th upload once a Ticket already has 5 active attachments', async () => {
    const ticketId = await createTicket(requesterId)

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set('X-Requester-Id', String(requesterId))
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: `file-${i}.png`,
          contentType: 'image/png',
        })
      expect(res.status).toBe(201)
    }

    const sixth = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'file-5.png',
        contentType: 'image/png',
      })

    expect(sixth.status).toBe(400)
    expect(sixth.body.field).toBeUndefined()

    const activeCount = await prisma.attachment.count({ where: { ticketId, removedAt: null } })
    expect(activeCount).toBe(5)
  })

  // API-24: uploading to another Requester's Ticket is a 404, not a 403
  // (ADR-0004/BR-21).
  it('returns 404 when uploading to a Ticket owned by a different Requester', async () => {
    const ticketId = await createTicket(otherRequesterId)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Ticket not found')
  })

  // API-25: uploading to a nonexistent Ticket is a 404
  it('returns 404 for a nonexistent Ticket id', async () => {
    const res = await request(app)
      .post('/api/tickets/999999999/attachments')
      .set('X-Requester-Id', String(requesterId))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(404)
  })

  // API-26: missing X-Requester-Id rejected 400
  it('rejects a request with no X-Requester-Id header', async () => {
    const ticketId = await createTicket(requesterId)

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })

    expect(res.status).toBe(400)
  })
})
