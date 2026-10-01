import { describe, it, expect } from 'vitest'
import { generateInitialPassword } from '../../src/services/initialPassword.service'

const DRAWS = 1000

// UNIT-03 (AC-41, AC-44, api-spec.md §7.2)
describe('initial password generator', () => {
  const passwords = Array.from({ length: DRAWS }, () => generateInitialPassword())

  it('draws four groups of four letters and digits', () => {
    for (const password of passwords) {
      expect(password).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
    }
  })

  it('never uses 0, O, o, 1, l, or I', () => {
    for (const password of passwords) {
      expect(password).not.toMatch(/[0Oo1lI]/)
    }
  })

  it('does not repeat a password', () => {
    expect(new Set(passwords).size).toBe(DRAWS)
  })

  // Upper-case letters, lower-case letters, and digits are all drawn from.
  it('draws from all three kinds of character', () => {
    const drawn = passwords.join('')

    expect(drawn).toMatch(/[A-Z]/)
    expect(drawn).toMatch(/[a-z]/)
    expect(drawn).toMatch(/[2-9]/)
  })
})
