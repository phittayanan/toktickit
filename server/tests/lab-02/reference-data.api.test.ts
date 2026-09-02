import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// API-03: GET /api/categories returns only active rows (Lab 1 shape unchanged)
describe('GET /api/categories', () => {
  it('returns only active categories as a flat array of {id, name}', async () => {
    const res = await request(app).get('/api/categories')

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
    const res = await request(app).get('/api/related-systems')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(6)
    for (const system of res.body) {
      expect(system).toHaveProperty('id')
      expect(system).toHaveProperty('name')
    }
  })
})

// API-05: GET /api/requesters excludes the inactive seed Requester
describe('GET /api/requesters', () => {
  it('returns only active requesters as {id, name, email}, excluding inactive ones', async () => {
    const res = await request(app).get('/api/requesters')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(4)
    for (const requester of res.body) {
      expect(requester).toHaveProperty('id')
      expect(requester).toHaveProperty('name')
      expect(requester).toHaveProperty('email')
    }
    const names = res.body.map((r: { name: string }) => r.name)
    expect(names).not.toContain('Anucha Boonmee')
  })

  it('does not require an X-Requester-Id header', async () => {
    const res = await request(app).get('/api/requesters')

    expect(res.status).not.toBe(400)
  })
})
