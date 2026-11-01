import { describe, expect, it } from 'vitest'

// A call a test leaves unmocked must never reach an API that happens to be
// running on this machine: its 401 would end the test's session and send the
// test to Login, or not, depending on which got there first. The real fetch
// says "fetch failed"; only the setup's stand-in says this.
describe('the client test setup', () => {
  it('fails an unmocked request without touching the network', async () => {
    await expect(fetch('http://localhost:4000/api/auth/me')).rejects.toThrow('Failed to fetch')
  })
})
