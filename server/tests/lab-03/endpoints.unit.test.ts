import { describe, it, expect } from 'vitest'
import { ENDPOINTS } from './support/endpoints'

const label = (e: { method: string; path: string }) => `${e.method} ${e.path}`

// The endpoint table drives authorization.api.test.ts, so it is held to
// the rules api-spec.md §1.5 fixes for every endpoint.
describe('endpoint table', () => {
  it('lists each endpoint once', () => {
    const labels = ENDPOINTS.map(label)

    expect(new Set(labels).size).toBe(labels.length)
  })

  it('leaves only health, login, and logout public', () => {
    const publicEndpoints = ENDPOINTS.filter((e) => e.roles === 'public').map(label)

    expect(publicEndpoints.sort()).toEqual(['GET /api/health', 'POST /api/auth/login', 'POST /api/auth/logout'])
  })

  it('exempts only me and change-password from the password-change check', () => {
    const exempt = ENDPOINTS.filter((e) => e.allowedBeforePasswordChange).map(label)

    expect(exempt.sort()).toEqual(['GET /api/auth/me', 'POST /api/auth/change-password'])
  })

  it('gives every /api/staff endpoint to IT Staff and Administrator only', () => {
    const staff = ENDPOINTS.filter((e) => e.path.startsWith('/api/staff/'))

    expect(staff).toHaveLength(8)
    for (const endpoint of staff) {
      expect(endpoint.roles, label(endpoint)).toEqual(['IT_STAFF', 'ADMINISTRATOR'])
    }
  })

  it('gives every /api/admin endpoint to Administrator only', () => {
    const admin = ENDPOINTS.filter((e) => e.path.startsWith('/api/admin/'))

    expect(admin).toHaveLength(4)
    for (const endpoint of admin) {
      expect(endpoint.roles, label(endpoint)).toEqual(['ADMINISTRATOR'])
    }
  })
})
