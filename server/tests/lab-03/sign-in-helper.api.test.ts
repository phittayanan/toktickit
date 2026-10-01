import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { ROLES } from './support/roles'
import { signInAs } from './support/signIn'

// The shared sign-in helper (tests.md §1): a user of a given role with a
// known password, signed in through POST /api/auth/login.
//
// Pending #47: needs the login and current-user endpoints. Remove `.skip`
// when they land.
describe.skip('signInAs', () => {
  it.each(ROLES)('signs in a new %s whose session the API accepts', async (role) => {
    const { user, cookie } = await signInAs(role)

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      mustChangePassword: false,
    })
  })
})
