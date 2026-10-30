import { describe, it, expect, afterEach } from 'vitest'
import { resetClock } from '../../src/clock'
import {
  clientRequestIdSchema,
  createActionTakenSchema,
  editActionTakenSchema,
} from '../../src/schemas/actionTaken.schema'
import { installFakeClock } from '../lab-03/support/clock'

const CLIENT_REQUEST_ID = '6f1c2b1e-7a44-4f7e-9a36-1d0c3d3f7a10'
const NOW = new Date('2026-10-30T02:00:00.000Z')

const createBody = (fields: Record<string, unknown> = {}) => ({
  clientRequestId: CLIENT_REQUEST_ID,
  status: 'PLANNED',
  description: 'Replace the laptop battery.',
  ...fields,
})

const editBody = (fields: Record<string, unknown> = {}) => ({
  expectedVersion: 1,
  actionAt: '2026-10-30T09:00:00+07:00',
  description: 'Replace the laptop battery.',
  result: null,
  status: 'PLANNED',
  assigneeId: 12,
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  ...fields,
})

function fieldOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  expect(result.success).toBe(false)

  return result.error!.issues[0].path[0]
}

afterEach(() => {
  resetClock()
})

// UNIT-02 (AC-03, AC-04)
describe('Action Taken body', () => {
  describe('clientRequestId', () => {
    it('accepts a UUID', () => {
      expect(clientRequestIdSchema.safeParse({ clientRequestId: CLIENT_REQUEST_ID }).success).toBe(true)
    })

    it.each([[undefined], [''], ['not-a-uuid'], [42], [null]])('refuses %j', (clientRequestId) => {
      expect(fieldOf(clientRequestIdSchema.safeParse({ clientRequestId }))).toBe('clientRequestId')
    })
  })

  describe.each([
    ['create', createActionTakenSchema, createBody],
    ['edit', editActionTakenSchema, editBody],
  ] as const)('%s', (_name, schema, body) => {
    it.each([
      ['description', 1, true],
      ['description', 2000, true],
      ['description', 2001, false],
      ['result', 2000, true],
      ['result', 2001, false],
      ['followUpNote', 2000, true],
      ['followUpNote', 2001, false],
      ['attachmentNotes', 500, true],
      ['attachmentNotes', 501, false],
    ])('%s of %i characters: %s', (field, length, accepted) => {
      const parsed = schema.safeParse(
        body({ [field]: 'x'.repeat(length), ...(field === 'followUpNote' && { followUpRequired: true }) }),
      )

      if (accepted) {
        expect(parsed.success).toBe(true)
      } else {
        expect(fieldOf(parsed)).toBe(field)
      }
    })

    it('measures text after trimming and keeps its line breaks', () => {
      const parsed = schema.parse(body({ description: `  ${'x'.repeat(1998)}\ny  `, result: ' first\nsecond ' }))

      expect(parsed.description).toBe(`${'x'.repeat(1998)}\ny`)
      expect(parsed.result).toBe('first\nsecond')
    })

    it.each([[undefined], [''], ['   '], [7]])('refuses a description of %j', (description) => {
      expect(fieldOf(schema.safeParse(body({ description })))).toBe('description')
    })

    it('stores an optional text left empty as null', () => {
      const parsed = schema.parse(body({ result: '  ', followUpNote: ' ', attachmentNotes: '' }))

      expect(parsed).toMatchObject({ result: null, followUpNote: null, attachmentNotes: null })
    })

    it('needs a Result for DONE, and only for DONE', () => {
      expect(schema.safeParse(body({ status: 'DONE', result: 'It works.' })).success).toBe(true)
      expect(schema.safeParse(body({ status: 'PLANNED', result: null })).success).toBe(true)
      expect(fieldOf(schema.safeParse(body({ status: 'DONE', result: null })))).toBe('result')
      expect(fieldOf(schema.safeParse(body({ status: 'DONE', result: '   ' })))).toBe('result')
    })

    it.each([
      [true, 'Check again next week.', true],
      [true, null, false],
      [true, '   ', false],
      [false, null, true],
      [false, '', true],
      [false, 'Check again next week.', false],
    ])('with followUpRequired %s and note %j: %s', (followUpRequired, followUpNote, accepted) => {
      const parsed = schema.safeParse(body({ followUpRequired, followUpNote }))

      if (accepted) {
        expect(parsed.success).toBe(true)
      } else {
        expect(fieldOf(parsed)).toBe('followUpNote')
      }
    })

    it.each([['2026-10-30'], ['2026-10-30T09:00:00'], ['yesterday'], [1793000000], [null]])(
      'refuses an actionAt of %j',
      (actionAt) => {
        expect(fieldOf(schema.safeParse(body({ actionAt })))).toBe('actionAt')
      },
    )

    it('reads an actionAt with a UTC offset as that instant', () => {
      const parsed = schema.parse(body({ actionAt: '2026-10-30T09:00:00+07:00' }))

      expect(parsed.actionAt).toEqual(new Date('2026-10-30T02:00:00.000Z'))
    })

    it('holds a DONE actionAt to the server clock, and no other status', () => {
      installFakeClock(NOW)
      const done = { status: 'DONE', result: 'It works.' }

      expect(schema.safeParse(body({ ...done, actionAt: NOW.toISOString() })).success).toBe(true)
      expect(fieldOf(schema.safeParse(body({ ...done, actionAt: '2026-10-30T02:00:00.001Z' })))).toBe('actionAt')
      expect(schema.safeParse(body({ actionAt: '2026-10-30T02:00:00.001Z' })).success).toBe(true)
    })

    it.each([[0], [-1], [1.5], ['12'], [null], [2147483648]])('refuses an assigneeId of %j', (assigneeId) => {
      expect(fieldOf(schema.safeParse(body({ assigneeId })))).toBe('assigneeId')
    })
  })

  describe('create only', () => {
    it('leaves actionAt and assigneeId to the service and defaults follow-up to no', () => {
      const parsed = createActionTakenSchema.parse(createBody())

      expect(parsed.actionAt).toBeUndefined()
      expect(parsed.assigneeId).toBeUndefined()
      expect(parsed).toMatchObject({ followUpRequired: false, followUpNote: null, result: null, attachmentNotes: null })
    })

    it.each([['CANCELLED'], ['done'], [undefined]])('refuses a status of %j', (status) => {
      expect(fieldOf(createActionTakenSchema.safeParse(createBody({ status })))).toBe('status')
    })

    it('drops keys the session, the server, and the path own', () => {
      const parsed = createActionTakenSchema.parse(
        createBody({ createdById: 1, createdAt: '2020-01-01T00:00:00Z', version: 9, ticketId: 3 }),
      )

      expect(Object.keys(parsed)).not.toEqual(
        expect.arrayContaining(['createdById', 'createdAt', 'version', 'ticketId']),
      )
    })
  })

  describe('edit only', () => {
    it.each([['PLANNED'], ['CANCELLED']])('accepts status %s with no Result', (status) => {
      expect(editActionTakenSchema.safeParse(editBody({ status })).success).toBe(true)
    })

    it('refuses an unknown status', () => {
      expect(fieldOf(editActionTakenSchema.safeParse(editBody({ status: 'REOPENED' })))).toBe('status')
    })

    it.each([
      'expectedVersion',
      'actionAt',
      'description',
      'result',
      'status',
      'assigneeId',
      'followUpRequired',
      'followUpNote',
      'attachmentNotes',
    ])('needs the key %s', (key) => {
      const { [key as keyof ReturnType<typeof editBody>]: _omitted, ...body } = editBody()

      expect(fieldOf(editActionTakenSchema.safeParse(body))).toBe(key)
    })

    it.each([[0], [-1], [1.5], ['1'], [null]])('refuses an expectedVersion of %j', (expectedVersion) => {
      expect(fieldOf(editActionTakenSchema.safeParse(editBody({ expectedVersion })))).toBe('expectedVersion')
    })
  })
})
