import { describe, it, expect } from 'vitest'
import { staffQueueQuerySchema } from '../../src/schemas/staffQueue.schema'

// UNIT-05 (AC-28, BR-44): the query contract of GET /api/staff/tickets
// (api-spec.md §5.1). Query values arrive as strings, and a repeated
// parameter as an array of them.
describe('staffQueueQuerySchema', () => {
  it('applies the defaults when no parameter is given', () => {
    const result = staffQueueQuerySchema.safeParse({})

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ page: 1, pageSize: 10, sortBy: 'updatedAt', sortDir: 'desc' })
  })

  it('reads every parameter of the table', () => {
    const result = staffQueueQuerySchema.safeParse({
      page: '3',
      pageSize: '25',
      search: '  battery  ',
      status: 'NEW,IN_PROGRESS',
      owner: '12',
      itPriority: 'HIGH',
      categoryId: '2',
      appearsResolved: 'true',
      sortBy: 'itPriority',
      sortDir: 'asc',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      page: 3,
      pageSize: 25,
      search: 'battery',
      status: ['NEW', 'IN_PROGRESS'],
      owner: 12,
      itPriority: 'HIGH',
      categoryId: 2,
      appearsResolved: true,
      sortBy: 'itPriority',
      sortDir: 'asc',
    })
  })

  it.each([
    ['pageSize', '10', 10],
    ['pageSize', '50', 50],
    ['status', 'WAITING_FOR_REQUESTER', ['WAITING_FOR_REQUESTER']],
    ['status', 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,CLOSED,REOPENED,CANCELLED', [
      'NEW',
      'OPEN',
      'IN_PROGRESS',
      'WAITING_FOR_REQUESTER',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
      'CANCELLED',
    ]],
    ['owner', 'unassigned', 'unassigned'],
    ['owner', 'me', 'me'],
    ['itPriority', 'LOW', 'LOW'],
    ['itPriority', 'MEDIUM', 'MEDIUM'],
    ['appearsResolved', 'false', false],
    ['sortBy', 'updatedAt', 'updatedAt'],
    ['sortBy', 'createdAt', 'createdAt'],
    ['sortBy', 'ticketNumber', 'ticketNumber'],
    ['sortDir', 'desc', 'desc'],
    ['search', 'x'.repeat(100), 'x'.repeat(100)],
  ])('accepts %s=%s', (parameter, value, parsed) => {
    const result = staffQueueQuerySchema.safeParse({ [parameter]: value })

    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty(parameter, parsed)
  })

  it.each(['', '   '])('ignores an empty search (%j)', (search) => {
    const result = staffQueueQuerySchema.safeParse({ search })

    expect(result.success).toBe(true)
    expect(result.data?.search).toBeUndefined()
  })

  it('ignores an unknown parameter name', () => {
    const result = staffQueueQuerySchema.safeParse({ assignee: 'me', requesterId: '7' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ page: 1, pageSize: 10, sortBy: 'updatedAt', sortDir: 'desc' })
  })

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', ''],
    ['page', '1e2'],
    ['page', '9'.repeat(30)],
    ['pageSize', '7'],
    ['pageSize', '0'],
    ['pageSize', '100'],
    ['pageSize', 'abc'],
    ['pageSize', ''],
    ['search', 'x'.repeat(101)],
    ['status', 'DONE'],
    ['status', 'NEW,DONE'],
    ['status', 'new'],
    ['status', 'NEW, OPEN'],
    ['status', 'NEW,'],
    ['status', ''],
    ['owner', 'abc'],
    ['owner', '0'],
    ['owner', '-3'],
    ['owner', '1.5'],
    ['owner', 'ME'],
    ['owner', ''],
    ['itPriority', 'URGENT'],
    ['itPriority', 'high'],
    ['itPriority', ''],
    ['categoryId', '0'],
    ['categoryId', '-2'],
    ['categoryId', '2.5'],
    ['categoryId', 'abc'],
    ['categoryId', ''],
    ['appearsResolved', 'yes'],
    ['appearsResolved', 'TRUE'],
    ['appearsResolved', '1'],
    ['appearsResolved', ''],
    ['sortBy', 'summary'],
    ['sortBy', 'requestedPriority'],
    ['sortBy', ''],
    ['sortDir', 'up'],
    ['sortDir', 'DESC'],
    ['sortDir', ''],
  ])('rejects %s=%j, naming the parameter', (parameter, value) => {
    const result = staffQueueQuerySchema.safeParse({ [parameter]: value })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual([parameter])
  })

  // A repeated parameter reaches the schema as an array.
  it.each([
    ['page', ['1', '2']],
    ['pageSize', ['10', '10']],
    ['search', ['battery', 'printer']],
    ['status', ['NEW', 'OPEN']],
    ['owner', ['me', 'unassigned']],
    ['itPriority', ['LOW', 'HIGH']],
    ['categoryId', ['1', '2']],
    ['appearsResolved', ['true', 'false']],
    ['sortBy', ['updatedAt', 'createdAt']],
    ['sortDir', ['asc', 'desc']],
  ])('rejects a repeated %s, naming the parameter', (parameter, values) => {
    const result = staffQueueQuerySchema.safeParse({ [parameter]: values })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual([parameter])
  })

  it('keeps the defaults of the parameters that are absent beside one that is given', () => {
    const result = staffQueueQuerySchema.safeParse({ sortBy: 'createdAt' })

    expect(result.data).toEqual({ page: 1, pageSize: 10, sortBy: 'createdAt', sortDir: 'desc' })
  })
})
