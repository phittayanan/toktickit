import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'

// BR-07: a password is stored only as a bcrypt hash, cost 12.
const BCRYPT_COST = 12
const BCRYPT_MAX_BYTES = 72

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

// A hash no password is ever checked against successfully, made at start-up
// so that none is written in the source.
const placeholderHash = hashPassword(randomBytes(32).toString('base64url'))

// BR-10: `hash` is null for an unknown email or a user with no password.
// A comparison of the same cost still runs, so the response time does not
// tell those cases from a wrong password.
//
// bcrypt reads only the first 72 bytes, and no stored password is longer
// (BR-08), so a longer input is never the password, whatever it starts with.
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? (await placeholderHash))

  return hash !== null && matches && Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES
}
