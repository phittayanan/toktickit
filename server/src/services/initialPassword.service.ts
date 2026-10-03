import { randomInt } from 'node:crypto'

// api-spec.md §7.2: the upper-case letters, lower-case letters, and digits
// except 0, O, o, 1, l, and I, which are easily misread when the password
// is passed on by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

const GROUPS = 4
const GROUP_LENGTH = 4

// BR-38, BR-39: an Initial Password is 16 random characters in four
// groups, drawn by a CSPRNG. It is returned once and stored only as a
// hash (BR-07).
export function generateInitialPassword(): string {
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  )

  return groups.join('-')
}
