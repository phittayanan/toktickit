import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// server/.env.example ships `UPLOAD_DIR=` empty; dotenv loads that as ''.
// An empty value must fall back to server/uploads, not crash on mkdir('').
describe('UPLOAD_DIR', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('falls back to server/uploads when UPLOAD_DIR is empty', async () => {
    vi.stubEnv('UPLOAD_DIR', '')
    vi.resetModules()
    const { UPLOAD_DIR } = await import('../../src/upload.js')
    expect(UPLOAD_DIR).toBe(path.join(__dirname, '..', '..', 'uploads'))
  })
})
