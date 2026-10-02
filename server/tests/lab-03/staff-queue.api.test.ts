import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { applicationOn, createThrowawayDatabase, prismaCli, type ThrowawayDatabase } from './support/throwawayDatabase'

// Every sign-in runs bcrypt at cost 12 (BR-07).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

type Application = Awaited<ReturnType<typeof applicationOn>>
type PrismaModule = typeof import('../../src/prisma')

// The queue is every Ticket of every Requester (BR-44), so this suite runs
// in a database of its own, where the twelve Tickets below are all there
// are and every expected row, order, and total is exact.
let database: ThrowawayDatabase
let app: Application['app']
let signInAs: Application['signInAs']
let prisma: PrismaModule['default']

// The signed-in IT Staff user every request below is made as.
let me: { id: number; name: string }
let cookie: string
// An Administrator, who owns no Ticket.
let administrator: { id: number; name: string }
let administratorCookie: string
let otherStaff: { id: number; name: string }
let alice: { id: number; name: string }
let bob: { id: number; name: string }
let hardware: { id: number; name: string }
let network: { id: number; name: string }

// Tickets are referred to by their position below, 1 to 12, which is also
// the order of their ids. Ticket Numbers run the other way, so that no
// sort field happens to agree with another.
const number = (ticket: number) => `TKT-2026-0002${String(13 - ticket).padStart(2, '0')}`
const numbers = (...tickets: number[]) => tickets.map(number)

const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}T02:00:00.000Z`
const hour = (h: number) => `2026-09-20T${String(h).padStart(2, '0')}:00:00.000Z`
const FLAGGED_AT = '2026-09-21T00:00:00.000Z'

type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
type Status =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

interface Fixture {
  summary: string
  requester: 'alice' | 'bob'
  category: 'hardware' | 'network'
  itPriority: Priority
  status: Status
  owner?: 'me' | 'other'
  flagged?: true
  createdAt: string
  updatedAt: string
}

// Tickets 1 and 2, 3 and 4, and so on share a created time, and Tickets 5
// and 6 share an updated time, so every sort has ties to break.
const TICKETS: Fixture[] = [
  /*  1 */ { summary: 'Laptop battery drains quickly', requester: 'alice', category: 'hardware', itPriority: 'HIGH', status: 'IN_PROGRESS', owner: 'me', createdAt: day(5), updatedAt: hour(7) },
  /*  2 */ { summary: 'Printer jams on every page', requester: 'alice', category: 'hardware', itPriority: 'LOW', status: 'NEW', createdAt: day(5), updatedAt: hour(3) },
  /*  3 */ { summary: 'VPN disconnects every hour', requester: 'alice', category: 'network', itPriority: 'HIGH', status: 'OPEN', owner: 'other', createdAt: day(1), updatedAt: hour(12) },
  /*  4 */ { summary: 'Wi-Fi drops in the library', requester: 'alice', category: 'network', itPriority: 'MEDIUM', status: 'WAITING_FOR_REQUESTER', flagged: true, createdAt: day(1), updatedAt: hour(1) },
  /*  5 */ { summary: 'Replacement Battery request', requester: 'alice', category: 'hardware', itPriority: 'LOW', status: 'RESOLVED', owner: 'other', createdAt: day(6), updatedAt: hour(9) },
  /*  6 */ { summary: 'Monitor flickers at startup', requester: 'alice', category: 'hardware', itPriority: 'MEDIUM', status: 'CLOSED', owner: 'other', createdAt: day(6), updatedAt: hour(9) },
  /*  7 */ { summary: 'Cannot reach the file share', requester: 'alice', category: 'network', itPriority: 'MEDIUM', status: 'REOPENED', createdAt: day(2), updatedAt: hour(5) },
  /*  8 */ { summary: 'Email quota exceeded', requester: 'bob', category: 'network', itPriority: 'HIGH', status: 'CANCELLED', createdAt: day(2), updatedAt: hour(2) },
  /*  9 */ { summary: 'Keyboard keys are sticking', requester: 'bob', category: 'hardware', itPriority: 'LOW', status: 'NEW', createdAt: day(3), updatedAt: hour(11) },
  /* 10 */ { summary: 'Shared printer is offline', requester: 'bob', category: 'network', itPriority: 'MEDIUM', status: 'OPEN', flagged: true, createdAt: day(3), updatedAt: hour(4) },
  /* 11 */ { summary: 'Slow Wi-Fi in the lab', requester: 'bob', category: 'network', itPriority: 'HIGH', status: 'IN_PROGRESS', owner: 'me', createdAt: day(4), updatedAt: hour(8) },
  /* 12 */ { summary: 'Docking station at 100% load is not_detected', requester: 'bob', category: 'hardware', itPriority: 'LOW', status: 'CLOSED', createdAt: day(4), updatedAt: hour(6) },
]

beforeAll(async () => {
  database = await createThrowawayDatabase('staff_queue')
  await prismaCli(database.url, 'migrate', 'deploy')

  const application = await applicationOn(database.url)
  app = application.app
  signInAs = application.signInAs
  prisma = ((await import('../../src/prisma.js')) as unknown as PrismaModule).default

  // Signed in through the helper, then given a name of their own.
  const signedInAs = async (role: 'IT_STAFF' | 'ADMINISTRATOR', name: string) => {
    const { user, cookie } = await signInAs(role)
    await prisma.user.update({ where: { id: user.id }, data: { name } })
    return { user: { id: user.id, name }, cookie }
  }
  ;({ user: me, cookie } = await signedInAs('IT_STAFF', 'Malee Srisuk'))
  ;({ user: administrator, cookie: administratorCookie } = await signedInAs('ADMINISTRATOR', 'Apinya Thongchai'))

  const user = (name: string, role: 'REQUESTER' | 'IT_STAFF') =>
    prisma.user.create({
      data: { name, email: `${name.toLowerCase().replace(' ', '.')}@example.com`, role },
      select: { id: true, name: true },
    })
  otherStaff = await user('Wichai Phromma', 'IT_STAFF')
  alice = await user('Alice Anantasin', 'REQUESTER')
  bob = await user('Bob Boonsri', 'REQUESTER')

  hardware = await prisma.category.create({ data: { name: 'Hardware' }, select: { id: true, name: true } })
  network = await prisma.category.create({ data: { name: 'Network' }, select: { id: true, name: true } })
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: 'Other' } })

  // One at a time, so that the ids follow the order above.
  for (const [index, ticket] of TICKETS.entries()) {
    await prisma.ticket.create({
      data: {
        ticketNumber: number(index + 1),
        requesterId: { alice, bob }[ticket.requester].id,
        categoryId: { hardware, network }[ticket.category].id,
        relatedSystemId: relatedSystem.id,
        summary: ticket.summary,
        description: 'A description long enough to satisfy validation, for a queue Ticket.',
        // Ticket 1 is the one whose IT Priority staff have changed.
        requestedPriority: index === 0 ? 'MEDIUM' : ticket.itPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.status,
        ownerId: ticket.owner ? { me, other: otherStaff }[ticket.owner].id : null,
        requesterResolvedAt: ticket.flagged ? FLAGGED_AT : null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    })
  }
})

afterAll(async () => {
  await database.drop()
})

function queue(query: Partial<Record<string, string | string[]>> = {}) {
  return request(app).get('/api/staff/tickets').query(query).set('Cookie', cookie)
}

const ticketNumbers = (res: request.Response) =>
  (res.body.data as Array<{ ticketNumber: string }>).map((ticket) => ticket.ticketNumber)

describe('GET /api/staff/tickets', () => {
  // API-21 (AC-24, BR-44)
  it('lists the Tickets of every Requester, most recently updated first, ten to a page', async () => {
    const res = await queue()

    expect(res.status).toBe(200)
    expect(ticketNumbers(res)).toEqual(numbers(3, 9, 6, 5, 11, 1, 12, 7, 10, 2))
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, totalItems: 12, totalPages: 2 })
  })

  // API-21: the row shape of api-spec.md §5.1, for an assigned Ticket and
  // an unassigned, flagged one
  it('returns each Ticket with its Requester, Category, owner, and indication', async () => {
    const res = await queue({ pageSize: '25' })

    const byNumber = (ticket: number) =>
      (res.body.data as Array<{ ticketNumber: string }>).find((row) => row.ticketNumber === number(ticket))

    expect(byNumber(1)).toEqual({
      id: expect.any(Number),
      ticketNumber: 'TKT-2026-000212',
      summary: 'Laptop battery drains quickly',
      requester: { id: alice.id, name: 'Alice Anantasin' },
      category: { id: hardware.id, name: 'Hardware' },
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      currentStatus: 'IN_PROGRESS',
      owner: { id: me.id, name: me.name },
      requesterResolvedAt: null,
      createdAt: '2026-09-05T02:00:00.000Z',
      updatedAt: '2026-09-20T07:00:00.000Z',
    })
    expect(byNumber(10)).toEqual({
      id: expect.any(Number),
      ticketNumber: 'TKT-2026-000203',
      summary: 'Shared printer is offline',
      requester: { id: bob.id, name: 'Bob Boonsri' },
      category: { id: network.id, name: 'Network' },
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'OPEN',
      owner: null,
      requesterResolvedAt: '2026-09-21T00:00:00.000Z',
      createdAt: '2026-09-03T02:00:00.000Z',
      updatedAt: '2026-09-20T04:00:00.000Z',
    })
  })

  // API-22 (AC-25, BR-44)
  it.each([
    { by: 'a Ticket Number fragment', search: 'tkt-2026-00021', expected: numbers(3, 1, 2) },
    { by: 'a Summary word', search: 'bAtTeRy', expected: numbers(5, 1) },
    { by: 'a Requester name', search: 'boonSRI', expected: numbers(9, 11, 12, 10, 8) },
    { by: 'a term with spaces around it', search: '  printer  ', expected: numbers(10, 2) },
  ])('search by $by lists only the matching Tickets, whatever the case', async ({ search, expected }) => {
    const res = await queue({ search })

    expect(res.status).toBe(200)
    expect(ticketNumbers(res)).toEqual(expected)
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, totalItems: expected.length, totalPages: 1 })
  })

  it('search that matches nothing lists nothing, with no pages', async () => {
    const res = await queue({ search: 'no such ticket' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } })
  })

  // A substring match: the pattern characters of SQL LIKE are ordinary
  // characters here. Only Ticket 12 has a `%` or a `_` in it.
  it.each([
    { search: '%', expected: numbers(12) },
    { search: '_', expected: numbers(12) },
    { search: '100% LOAD', expected: numbers(12) },
    { search: 'not_det', expected: numbers(12) },
    { search: 'batter_', expected: [] },
    { search: '\\', expected: [] },
  ])('search for $search matches it literally', async ({ search, expected }) => {
    const res = await queue({ search })

    expect(res.status).toBe(200)
    expect(ticketNumbers(res)).toEqual(expected)
  })

  it('an empty search is ignored', async () => {
    const res = await queue({ search: '   ' })

    expect(res.status).toBe(200)
    expect(res.body.meta.totalItems).toBe(12)
  })

  // API-23 (AC-26)
  it.each([
    { filter: 'one status', query: { status: 'NEW' }, expected: numbers(9, 2) },
    { filter: 'a list of statuses', query: { status: 'NEW,CLOSED' }, expected: numbers(9, 6, 12, 2) },
    {
      filter: 'every unfinished status',
      query: { status: 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED' },
      expected: numbers(3, 9, 5, 11, 1, 7, 10, 2, 4),
    },
    { filter: 'owner unassigned', query: { owner: 'unassigned' }, expected: numbers(9, 12, 7, 10, 2, 8, 4) },
    { filter: 'owner me', query: { owner: 'me' }, expected: numbers(11, 1) },
    { filter: 'IT Priority', query: { itPriority: 'LOW' }, expected: numbers(9, 5, 12, 2) },
    { filter: 'appears resolved', query: { appearsResolved: 'true' }, expected: numbers(10, 4) },
    {
      filter: 'does not appear resolved',
      query: { appearsResolved: 'false' },
      expected: numbers(3, 9, 6, 5, 11, 1, 12, 7, 2, 8),
    },
    {
      filter: 'status and owner together',
      query: { status: 'NEW,OPEN', owner: 'unassigned' },
      expected: numbers(9, 10, 2),
    },
    { filter: 'a filter and a search together', query: { itPriority: 'LOW', search: 'battery' }, expected: numbers(5) },
  ])('filter by $filter lists only the Tickets that match', async ({ query, expected }) => {
    const res = await queue(query)

    expect(res.status).toBe(200)
    expect(ticketNumbers(res)).toEqual(expected)
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, totalItems: expected.length, totalPages: 1 })
  })

  // API-23: the two filters whose value is an id
  it('filter by an owner id and by a Category lists only the Tickets that match', async () => {
    const owned = await queue({ owner: String(otherStaff.id) })
    const inCategory = await queue({ categoryId: String(network.id) })
    const both = await queue({ categoryId: String(network.id), appearsResolved: 'true', itPriority: 'MEDIUM' })

    expect(ticketNumbers(owned)).toEqual(numbers(3, 6, 5))
    expect(ticketNumbers(inCategory)).toEqual(numbers(3, 11, 7, 10, 8, 4))
    expect(ticketNumbers(both)).toEqual(numbers(10, 4))
  })

  // api-spec.md §5.1: `me` is the session user
  it('owner me is whoever is signed in: an Administrator who owns nothing sees an empty list', async () => {
    const all = await request(app).get('/api/staff/tickets').set('Cookie', administratorCookie)
    const mine = await request(app).get('/api/staff/tickets').query({ owner: 'me' }).set('Cookie', administratorCookie)

    expect(all.status).toBe(200)
    expect(all.body.meta.totalItems).toBe(12)
    expect(mine.status).toBe(200)
    expect(mine.body).toEqual({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } })
  })

  // api-spec.md §5.1: a well-formed owner or categoryId that matches no
  // row yields an empty result, not an error
  it.each([
    { owner: '999999999' },
    { categoryId: '999999999' },
    // Beyond what an id column can hold.
    { owner: '99999999999' },
    { categoryId: '99999999999' },
  ])('a well-formed id that matches no row (%o) lists nothing', async (query) => {
    const res = await queue(query)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } })
  })

  // API-24 (AC-27): ties are broken by id descending in both directions
  it.each([
    { sortBy: 'updatedAt', sortDir: 'desc', expected: numbers(3, 9, 6, 5, 11, 1, 12, 7, 10, 2, 8, 4) },
    { sortBy: 'updatedAt', sortDir: 'asc', expected: numbers(4, 8, 2, 10, 7, 12, 1, 11, 6, 5, 9, 3) },
    { sortBy: 'createdAt', sortDir: 'desc', expected: numbers(6, 5, 2, 1, 12, 11, 10, 9, 8, 7, 4, 3) },
    { sortBy: 'createdAt', sortDir: 'asc', expected: numbers(4, 3, 8, 7, 10, 9, 12, 11, 2, 1, 6, 5) },
    { sortBy: 'ticketNumber', sortDir: 'desc', expected: numbers(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12) },
    { sortBy: 'ticketNumber', sortDir: 'asc', expected: numbers(12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1) },
    // Low, then Medium, then High.
    { sortBy: 'itPriority', sortDir: 'asc', expected: numbers(12, 9, 5, 2, 10, 7, 6, 4, 11, 8, 3, 1) },
    { sortBy: 'itPriority', sortDir: 'desc', expected: numbers(11, 8, 3, 1, 10, 7, 6, 4, 12, 9, 5, 2) },
  ])('sort by $sortBy $sortDir holds across two pages, with no row repeated or skipped', async ({ sortBy, sortDir, expected }) => {
    const first = await queue({ sortBy, sortDir, page: '1' })
    const second = await queue({ sortBy, sortDir, page: '2' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(ticketNumbers(first)).toEqual(expected.slice(0, 10))
    expect(ticketNumbers(second)).toEqual(expected.slice(10))
  })

  it('sort applies to a filtered list', async () => {
    const res = await queue({ owner: 'unassigned', sortBy: 'itPriority', sortDir: 'desc' })

    expect(ticketNumbers(res)).toEqual(numbers(8, 10, 7, 4, 12, 9, 2))
  })

  // API-25 (AC-28)
  it('page 2 holds the rows after the first ten', async () => {
    const res = await queue({ page: '2' })

    expect(res.status).toBe(200)
    expect(ticketNumbers(res)).toEqual(numbers(8, 4))
    expect(res.body.meta).toEqual({ page: 2, pageSize: 10, totalItems: 12, totalPages: 2 })
  })

  it.each([
    { pageSize: '10', rows: 10, totalPages: 2 },
    { pageSize: '25', rows: 12, totalPages: 1 },
    { pageSize: '50', rows: 12, totalPages: 1 },
  ])('pageSize $pageSize returns $rows rows in $totalPages page(s)', async ({ pageSize, rows, totalPages }) => {
    const res = await queue({ pageSize })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(rows)
    expect(res.body.meta).toEqual({ page: 1, pageSize: Number(pageSize), totalItems: 12, totalPages })
  })

  it('a page past the last of a filtered list is empty with the totals of that list', async () => {
    const res = await queue({ owner: 'unassigned', page: '2' })

    expect(res.body).toEqual({ data: [], meta: { page: 2, pageSize: 10, totalItems: 7, totalPages: 1 } })
  })

  it.each(['3', '1000000000', '9007199254740991'])('page %s, past the last, is empty with the true totals', async (page) => {
    const res = await queue({ page })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      data: [],
      meta: { page: Number(page), pageSize: 10, totalItems: 12, totalPages: 2 },
    })
  })

  // API-26 (AC-28, BR-44): nothing is silently defaulted
  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', ''],
    ['pageSize', '7'],
    ['pageSize', '100'],
    ['pageSize', ''],
    ['search', 'x'.repeat(101)],
    ['status', 'DONE'],
    ['status', 'NEW,DONE'],
    ['status', 'new'],
    ['status', ''],
    ['owner', 'abc'],
    ['owner', '0'],
    ['owner', 'ME'],
    ['owner', ''],
    ['itPriority', 'URGENT'],
    ['itPriority', ''],
    ['categoryId', '0'],
    ['categoryId', 'abc'],
    ['categoryId', ''],
    ['appearsResolved', 'yes'],
    ['appearsResolved', ''],
    ['sortBy', 'summary'],
    ['sortBy', ''],
    ['sortDir', 'up'],
    ['sortDir', ''],
    // A repeated parameter.
    ['page', ['1', '2']],
    ['pageSize', ['10', '25']],
    ['search', ['battery', 'printer']],
    ['status', ['NEW', 'OPEN']],
    ['owner', ['me', 'unassigned']],
    ['itPriority', ['LOW', 'HIGH']],
    ['categoryId', ['1', '2']],
    ['appearsResolved', ['true', 'false']],
    ['sortBy', ['updatedAt', 'createdAt']],
    ['sortDir', ['asc', 'desc']],
  ])('%s=%j is rejected 400, naming the parameter', async (parameter, value) => {
    const res = await queue({ [parameter]: value })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: parameter })
  })

  it('an invalid value is rejected beside valid ones, and one of several is named', async () => {
    const one = await queue({ status: 'NEW', owner: 'me', sortBy: 'summary' })
    const several = await queue({ sortDir: 'up', page: '0' })

    expect(one.status).toBe(400)
    expect(one.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'sortBy' })
    expect(several.status).toBe(400)
    expect(several.body).toEqual({ error: expect.any(String), code: 'VALIDATION_ERROR', field: 'page' })
  })

  it('an unknown parameter name is ignored', async () => {
    const res = await queue({ assignee: 'me', requesterId: String(alice.id) })

    expect(res.status).toBe(200)
    expect(res.body.meta.totalItems).toBe(12)
  })

  // api-spec.md §1.5: the session and role checks come before the query
  // is examined (step 5)
  it('answers no session 401 and a Requester 403 before an invalid query is examined', async () => {
    const requester = await signInAs('REQUESTER')

    const signedOut = await request(app).get('/api/staff/tickets').query({ pageSize: '7' })
    const wrongRole = await request(app).get('/api/staff/tickets').query({ pageSize: '7' }).set('Cookie', requester.cookie)

    expect(signedOut.status).toBe(401)
    expect(signedOut.body).toEqual({ error: 'You are not signed in.', code: 'UNAUTHENTICATED' })
    expect(wrongRole.status).toBe(403)
    expect(wrongRole.body).toEqual({ error: expect.any(String), code: 'FORBIDDEN' })
  })
})

// api-spec.md §5.3 (BR-21)
describe('GET /api/staff/eligible-owners', () => {
  it('lists the active IT Staff and Administrators, ordered by name', async () => {
    await prisma.user.create({
      data: { name: 'Pranee Chaiyasit', email: 'pranee.chaiyasit@example.com', role: 'IT_STAFF', isActive: false },
    })
    await prisma.user.create({
      data: { name: 'Anucha Boonmee', email: 'anucha.boonmee@example.com', role: 'ADMINISTRATOR', isActive: false },
    })

    const res = await request(app).get('/api/staff/eligible-owners').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: administrator.id, name: 'Apinya Thongchai', role: 'ADMINISTRATOR' },
      { id: me.id, name: 'Malee Srisuk', role: 'IT_STAFF' },
      { id: otherStaff.id, name: 'Wichai Phromma', role: 'IT_STAFF' },
    ])
  })

  it('answers an Administrator the same list', async () => {
    const asStaff = await request(app).get('/api/staff/eligible-owners').set('Cookie', cookie)
    const asAdministrator = await request(app).get('/api/staff/eligible-owners').set('Cookie', administratorCookie)

    expect(asAdministrator.status).toBe(200)
    expect(asAdministrator.body).toEqual(asStaff.body)
    expect(asAdministrator.body).toHaveLength(3)
  })

  it('answers no session 401 and a Requester 403', async () => {
    const requester = await signInAs('REQUESTER')

    const signedOut = await request(app).get('/api/staff/eligible-owners')
    const wrongRole = await request(app).get('/api/staff/eligible-owners').set('Cookie', requester.cookie)

    expect(signedOut.status).toBe(401)
    expect(signedOut.body).toEqual({ error: 'You are not signed in.', code: 'UNAUTHENTICATED' })
    expect(wrongRole.status).toBe(403)
    expect(wrongRole.body).toEqual({ error: expect.any(String), code: 'FORBIDDEN' })
  })
})
