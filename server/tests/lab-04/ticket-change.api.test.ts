import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/prisma'
import { resetClock } from '../../src/clock'
import { installFakeClock } from '../lab-03/support/clock'
import { signInAs } from '../lab-03/support/signIn'

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
    summary: 'ticket-change.api.test ticket',
    description: 'A ticket created solely to exercise Ticket Changes.',
  })
  expect(res.status).toBe(201)

  return res.body.id
}

const upload = (ticketId: number, cookie: string) =>
  request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('Cookie', cookie)
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'screenshot.png', contentType: 'image/png' })

// The drift issue #74 removes from the copies of the Ticket Change sequence.
describe('Ticket Change', () => {
  it('stamps a bulk unassign with the time of the shared clock', async () => {
    const administrator = await signInAs('ADMINISTRATOR')
    const requester = await signInAs('REQUESTER')
    const owner = await signInAs('IT_STAFF')
    const ticketId = await createTicket(requester.cookie)
    await prisma.ticket.update({ where: { id: ticketId }, data: { ownerId: owner.user.id, currentStatus: 'OPEN' } })
    // The server clock, standing still a few minutes from now so that it is
    // not the time the test runs.
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await request(app)
      .patch(`/api/admin/users/${owner.user.id}`)
      .set('Cookie', administrator.cookie)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.unassignedTicketCount).toBe(1)
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    expect(ticket.ownerId).toBeNull()
    expect(ticket.ownerChangedAt).toEqual(serverTime)
    expect(ticket.updatedAt).toEqual(serverTime)
  })

  it('stamps a soft removal with the time of the shared clock', async () => {
    const { cookie } = await signInAs('REQUESTER')
    const ticketId = await createTicket(cookie)
    const uploaded = await upload(ticketId, cookie)
    expect(uploaded.status).toBe(201)
    const serverTime = new Date(Date.now() + 5 * 60_000)
    installFakeClock(serverTime)

    const res = await request(app)
      .post(`/api/attachments/${uploaded.body.id}/remove`)
      .set('Cookie', cookie)
      .send({ removalReason: 'Uploaded the wrong screenshot' })

    expect(res.status).toBe(200)
    expect(res.body.removedAt).toBe(serverTime.toISOString())
  })

  // User rows are taken before the Ticket, the order User Management takes
  // them in. Here the test holds the author's row locked: a change that
  // takes the Ticket first would sit on it while it waits for the author,
  // and a change to that author would then wait on it for ever.
  it.each([
    {
      name: 'a Public Comment',
      status: 201,
      send: (ticketId: number, _attachmentId: number, cookie: string) =>
        request(app)
          .post(`/api/tickets/${ticketId}/comments`)
          .set('Cookie', cookie)
          .send({ body: 'Any news on this?' }),
    },
    {
      name: 'a new Attachment',
      status: 201,
      send: (ticketId: number, _attachmentId: number, cookie: string) => upload(ticketId, cookie),
    },
    {
      name: 'a soft removal',
      status: 200,
      send: (_ticketId: number, attachmentId: number, cookie: string) =>
        request(app)
          .post(`/api/attachments/${attachmentId}/remove`)
          .set('Cookie', cookie)
          .send({ removalReason: 'Uploaded the wrong screenshot' }),
    },
  ])('takes the author of $name before the Ticket', async ({ send, status }) => {
    const author = await signInAs('REQUESTER')
    const ticketId = await createTicket(author.cookie)
    const uploaded = await upload(ticketId, author.cookie)
    expect(uploaded.status).toBe(201)

    let change!: Promise<request.Response>
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${author.user.id} FOR UPDATE`

        change = send(ticketId, uploaded.body.id, author.cookie).then((res) => res)
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

    expect((await change).status).toBe(status)
  })
})
