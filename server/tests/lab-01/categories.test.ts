import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { signInAs } from '../lab-03/support/signIn'

// API-02: Categories endpoint returns the four seeded categories
describe('GET /api/categories', () => {
  it('returns the four seeded categories with id and name, in order', async () => {
    // Lab 3: reference data needs a session of any role.
    const { cookie } = await signInAs('REQUESTER')

    const res = await request(app).get('/api/categories').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      'Account and Access',
      'Hardware',
      'Software',
      'Network',
    ])
    for (const category of res.body) {
      expect(category).toHaveProperty('id')
      expect(category).toHaveProperty('name')
    }
  })
})
