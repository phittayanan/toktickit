import { describe, it, expect } from 'vitest'
import { firstUnmetPasswordRule } from '../../src/services/passwordPolicy.service'

// UNIT-01 (AC-08): the BR-08 password policy at its boundaries.
describe('firstUnmetPasswordRule', () => {
  it('accepts 8 characters with upper case, lower case, a digit, and a special character', () => {
    expect(firstUnmetPasswordRule('Abcdef1!')).toBeNull()
  })

  it('rejects 7 characters as too short', () => {
    expect(firstUnmetPasswordRule('Abcde1!')).toBe('MIN_LENGTH')
  })

  it('accepts 72 characters', () => {
    expect(firstUnmetPasswordRule('Ab1!' + 'a'.repeat(68))).toBeNull()
  })

  it('rejects 73 characters as too long', () => {
    expect(firstUnmetPasswordRule('Ab1!' + 'a'.repeat(69))).toBe('MAX_LENGTH')
  })

  // bcrypt reads at most 72 bytes (specification.md §11 item 2): 'é' is one
  // character but two bytes in UTF-8, so this is 72 characters and 73 bytes.
  it('rejects 72 characters that exceed 72 UTF-8 bytes', () => {
    expect(firstUnmetPasswordRule('Ab1!é' + 'a'.repeat(67))).toBe('MAX_BYTES')
  })

  it.each([
    ['an upper-case letter', 'abcdef1!', 'UPPER_CASE'],
    ['a lower-case letter', 'ABCDEF1!', 'LOWER_CASE'],
    ['a digit', 'Abcdefg!', 'DIGIT'],
    ['a special character', 'Abcdefg1', 'SPECIAL'],
  ])('rejects a password lacking %s', (_label, password, rule) => {
    expect(firstUnmetPasswordRule(password)).toBe(rule)
  })

  it('does not count whitespace as a special character', () => {
    expect(firstUnmetPasswordRule('Abcdef 1')).toBe('SPECIAL')
    expect(firstUnmetPasswordRule('Abcd\tef1')).toBe('SPECIAL')
  })

  // '²' (U+00B2) is a number character but not a decimal digit, so under
  // BR-08 it is "not a letter, digit, or whitespace": a special character.
  it('counts a number character that is not a decimal digit as special', () => {
    expect(firstUnmetPasswordRule('Abcdef1²')).toBeNull()
  })

  it('names the first unmet rule when several are broken', () => {
    expect(firstUnmetPasswordRule('abc')).toBe('MIN_LENGTH')
    expect(firstUnmetPasswordRule('abcdefgh')).toBe('UPPER_CASE')
    expect(firstUnmetPasswordRule('ABCDEFGH')).toBe('LOWER_CASE')
    expect(firstUnmetPasswordRule('Abcdefgh')).toBe('DIGIT')
  })
})
