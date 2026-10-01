import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { signInAs } from '../lab-03/support/signIn'

// Lab 3: reference data needs a session of any role.
let cookie: string

beforeAll(async () => {
  cookie = (await signInAs('REQUESTER')).cookie
})

// API-03: GET /api/categories returns only active rows (Lab 1 shape unchanged)
describe('GET /api/categories', () => {
  it('returns only active categories as a flat array of {id, name}', async () => {
    const res = await request(app).get('/api/categories').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    for (const category of res.body) {
      expect(category).toHaveProperty('id')
      expect(category).toHaveProperty('name')
      expect(category).not.toHaveProperty('isActive')
    }
  })
})

// API-04: GET /api/related-systems returns seeded active rows
describe('GET /api/related-systems', () => {
  it('returns at least 6 active related systems as a flat array of {id, name}', async () => {
    const res = await request(app).get('/api/related-systems').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(6)
    for (const system of res.body) {
      expect(system).toHaveProperty('id')
      expect(system).toHaveProperty('name')
    }
  })
})
